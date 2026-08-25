import "dotenv/config";

import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import {
  VARIANTS,
  parseObjectKeyFromUrl,
  splitKey,
  variantKey,
  generateVariantBuffer,
} from "./lib/imageVariants.mjs";

// One-time backfill: for every currently published card_images row, generate
// two additive WebP variants next to the untouched original in R2:
//   card-images/<season>/<file>.png          (original — never read for writing, never modified)
//   card-images/<season>/grid/<file>.webp     (400w, q82 — Cards-page tile / grid contexts)
//   card-images/<season>/thumb/<file>.webp    (100w, q82 — small roster/lineup thumbnails)
//
// Idempotent/resumable: skips any pair that already exists in R2 unless --force
// is passed, so a partial run (or a re-run after a failure) is always safe.
//
// Resize settings and key convention live in scripts/lib/imageVariants.mjs,
// shared with scripts/sync-images-to-r2.mjs (the ongoing pipeline).

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseArgs(argv) {
  const args = { limit: null, dryRun: false, force: false, onlySeason: null };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--force") args.force = true;
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.split("=")[1]);
    else if (arg.startsWith("--only-season=")) args.onlySeason = arg.split("=")[1];
  }

  return args;
}

function formatError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function fetchPublishedImages(supabase) {
  const rowsByKey = new Map();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("card_images")
      .select("card_key, image_url")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`card_images query failed: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.card_key) rowsByKey.set(row.card_key, row);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return [...rowsByKey.values()];
}

async function objectExists(s3, bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") {
      return false;
    }
    throw error;
  }
}

async function downloadObject(s3, bucket, key) {
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks = [];
  for await (const chunk of result.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function uploadObject(s3, bucket, key, buffer) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

// Small fixed-size concurrency pool — sequential would take hours across
// ~13,000 images; unbounded parallel risks hammering R2/Supabase.
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, runNext));
  return results;
}

async function processRow(row, { s3, bucket, dryRun, force }) {
  const objectKey = parseObjectKeyFromUrl(row.image_url);
  if (!objectKey) {
    return { status: "skipped-unparseable", card_key: row.card_key, url: row.image_url };
  }

  const parsed = splitKey(objectKey);
  if (!parsed) {
    return { status: "skipped-unparseable", card_key: row.card_key, url: row.image_url };
  }

  const { season, basename } = parsed;
  const targets = VARIANTS.map((v) => ({
    ...v,
    key: variantKey(season, basename, v.name),
  }));

  if (!force) {
    try {
      const existence = await Promise.all(
        targets.map((t) => objectExists(s3, bucket, t.key)),
      );
      if (existence.every(Boolean)) {
        return { status: "skipped-exists", card_key: row.card_key, season };
      }
    } catch (error) {
      // A transient network/DNS blip here previously propagated uncaught out
      // of processRow and silently killed one of the pool's worker loops
      // mid-run. Treat it as a per-row failure instead so one bad request
      // can't take down a fraction of the whole run's concurrency.
      return {
        status: "failed-existence-check",
        card_key: row.card_key,
        objectKey,
        error: formatError(error),
      };
    }
  }

  if (dryRun) {
    return { status: "dry-run-would-process", card_key: row.card_key, season, objectKey, targets: targets.map((t) => t.key) };
  }

  let original;
  try {
    original = await downloadObject(s3, bucket, objectKey);
  } catch (error) {
    return { status: "failed-download", card_key: row.card_key, objectKey, error: formatError(error) };
  }

  const produced = [];
  for (const target of targets) {
    try {
      const exists = !force && (await objectExists(s3, bucket, target.key));
      if (exists) {
        produced.push({ variant: target.name, key: target.key, uploaded: false, bytes: null });
        continue;
      }

      const buffer = await generateVariantBuffer(original, target);

      await uploadObject(s3, bucket, target.key, buffer);
      produced.push({ variant: target.name, key: target.key, uploaded: true, bytes: buffer.length });
    } catch (error) {
      return {
        status: "failed-variant",
        card_key: row.card_key,
        objectKey,
        variant: target.name,
        error: formatError(error),
      };
    }
  }

  return { status: "processed", card_key: row.card_key, season, objectKey, produced };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
  const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = requireEnv("R2_BUCKET_NAME");
  const endpoint = requireEnv("R2_S3_ENDPOINT");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");

  if (!supabaseUrl) throw new Error("Missing VITE_SUPABASE_URL environment variable.");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const s3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  console.log("Loading published card_images rows from Supabase...");
  let rows = await fetchPublishedImages(supabase);
  console.log(`Loaded ${rows.length} published rows.`);

  if (args.onlySeason) {
    rows = rows.filter((r) => parseObjectKeyFromUrl(r.image_url)?.includes(`/${args.onlySeason}/`));
    console.log(`Filtered to season ${args.onlySeason}: ${rows.length} rows.`);
  }

  if (args.limit) {
    rows = rows.slice(0, args.limit);
    console.log(`Limited to first ${rows.length} rows (--limit).`);
  }

  console.log(
    `Mode: ${args.dryRun ? "DRY RUN (no downloads/uploads)" : "LIVE"}${args.force ? " | --force (re-generate even if variants exist)" : ""}`,
  );
  console.log("");

  const summary = {
    processed: 0,
    skippedExists: 0,
    skippedUnparseable: 0,
    dryRunWouldProcess: 0,
    failedDownload: 0,
    failedVariant: 0,
    failedExistenceCheck: 0,
    variantsUploaded: 0,
    variantsAlreadyPresent: 0,
    bytesUploaded: 0,
  };
  const failures = [];

  const results = await runPool(rows, 8, (row) =>
    processRow(row, { s3, bucket, dryRun: args.dryRun, force: args.force }),
  );

  for (const result of results) {
    switch (result.status) {
      case "processed": {
        summary.processed += 1;
        for (const p of result.produced) {
          if (p.uploaded) {
            summary.variantsUploaded += 1;
            summary.bytesUploaded += p.bytes ?? 0;
          } else {
            summary.variantsAlreadyPresent += 1;
          }
        }
        console.log(
          `[OK] ${result.card_key} (${result.season}) -> ` +
            result.produced.map((p) => `${p.variant}:${p.uploaded ? p.bytes + "b" : "exists"}`).join(", "),
        );
        break;
      }
      case "skipped-exists":
        summary.skippedExists += 1;
        break;
      case "skipped-unparseable":
        summary.skippedUnparseable += 1;
        failures.push(result);
        break;
      case "dry-run-would-process":
        summary.dryRunWouldProcess += 1;
        console.log(`[DRY-RUN] ${result.card_key} (${result.season}) -> ${result.targets.join(", ")}`);
        break;
      case "failed-download":
        summary.failedDownload += 1;
        failures.push(result);
        console.error(`[FAILED-DOWNLOAD] ${result.card_key}: ${result.error}`);
        break;
      case "failed-variant":
        summary.failedVariant += 1;
        failures.push(result);
        console.error(`[FAILED-VARIANT:${result.variant}] ${result.card_key}: ${result.error}`);
        break;
      case "failed-existence-check":
        summary.failedExistenceCheck += 1;
        failures.push(result);
        console.error(`[FAILED-EXISTENCE-CHECK] ${result.card_key}: ${result.error}`);
        break;
      default:
        break;
    }
  }

  console.log("");
  console.log("Summary");
  console.log("-------");
  console.log(`Rows considered:          ${rows.length}`);
  console.log(`Processed (uploaded>=1):  ${summary.processed}`);
  console.log(`Already had both variants:${summary.skippedExists}`.replace(":", ": "));
  console.log(`Unparseable image_url:    ${summary.skippedUnparseable}`);
  if (args.dryRun) console.log(`Would process (dry-run):  ${summary.dryRunWouldProcess}`);
  console.log(`Variant files uploaded:   ${summary.variantsUploaded}`);
  console.log(`Variant files pre-existing (skipped within a processed row): ${summary.variantsAlreadyPresent}`);
  console.log(`Bytes uploaded (this run):${summary.bytesUploaded} (${(summary.bytesUploaded / 1024 / 1024).toFixed(2)} MB)`.replace(":", ": "));
  console.log(`Failed downloads:         ${summary.failedDownload}`);
  console.log(`Failed variant generation:${summary.failedVariant}`.replace(":", ": "));
  console.log(`Failed existence checks:  ${summary.failedExistenceCheck}`);

  if (failures.length > 0) {
    console.log("");
    console.log("Failures / skips detail");
    console.log("------------------------");
    for (const f of failures) console.log(JSON.stringify(f));
  }

  if (summary.failedDownload + summary.failedVariant + summary.failedExistenceCheck > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
