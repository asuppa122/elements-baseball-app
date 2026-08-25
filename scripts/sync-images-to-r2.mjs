import "dotenv/config";

import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { VARIANTS, variantKey, generateVariantBuffer } from "./lib/imageVariants.mjs";

// Ongoing pipeline (Piece 2): run this after `import:images` to close the loop
// that script leaves open — import-images.mjs only writes to Supabase Storage,
// it never reaches R2. This script finds card_images rows still pointing at
// Supabase Storage, mirrors the original into R2 unchanged, generates the same
// grid/thumb WebP variants Piece 1 backfilled for the existing catalog, and
// then repoints the DB row's image_url/thumbnail_url at the new R2 object —
// matching how every other row in the catalog already works (a direct R2 URL,
// no runtime rewrite). The Supabase Storage original is left in place as a
// rollback safety net; nothing is deleted from Supabase Storage by this script.
//
// Idempotent/resumable: a row already pointing at R2 is left untouched and
// simply skipped, so this is always safe to re-run (e.g. chained after every
// import) rather than needing to track "which rows are new" separately.

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseArgs(argv) {
  const args = { limit: null, dryRun: false, cardKey: null };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.split("=")[1]);
    else if (arg.startsWith("--card-key=")) args.cardKey = arg.split("=")[1];
  }

  return args;
}

// Same public R2 host every existing card_images row already resolves to
// (hardcoded in src/utils/cardHelpers.ts's normalizeImageUrl). Duplicated here
// rather than shared, since that file is client TS and this is a plain Node
// script with no shared build step — if this bucket's public domain ever
// changes, update both places.
const R2_PUBLIC_BASE_URL = "https://pub-67aab109454d41809ce03ab0c1c9567d.r2.dev";

function formatError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Supabase Storage public URLs look like:
//   https://<project>.supabase.co/storage/v1/object/public/card-images/<season>/<file>
// (distinct from R2's `https://<host>/card-images/<season>/<file>` — no
// /storage/v1/object/public/ segment — so this never matches an R2 URL.)
const SUPABASE_STORAGE_PATTERN =
  /^https:\/\/[^/]+\/storage\/v1\/object\/public\/card-images\/(.+)$/;

function parseSupabaseStorageUrl(imageUrl) {
  const match = String(imageUrl ?? "").match(SUPABASE_STORAGE_PATTERN);
  if (!match) return null;

  const rest = match[1]; // "<season>/<file>"
  const parts = rest.split("/");
  if (parts.length !== 2) return null;

  const [season, filename] = parts;
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return null;

  return {
    storagePath: rest,
    season,
    basename: filename.slice(0, dot),
    filename,
  };
}

async function fetchAllImageRows(supabase) {
  const rowsByKey = new Map();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("card_images")
      .select("id, card_key, image_url")
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

async function downloadFromSupabaseStorage(publicUrl) {
  const response = await fetch(publicUrl);
  if (!response.ok) {
    throw new Error(`Supabase Storage fetch failed: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadObject(s3, bucket, key, buffer, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

function getMimeType(filename) {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

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

async function processRow(row, { supabase, s3, bucket, r2PublicBase, dryRun }) {
  const parsed = parseSupabaseStorageUrl(row.image_url);
  if (!parsed) {
    // Already on R2 (or some other/unrecognized URL shape) — nothing to sync.
    return { status: "skipped-not-supabase-storage", card_key: row.card_key };
  }

  const originalKey = `card-images/${parsed.storagePath}`;

  if (dryRun) {
    return {
      status: "dry-run-would-sync",
      card_key: row.card_key,
      storagePath: parsed.storagePath,
      originalKey,
      variantKeys: VARIANTS.map((v) => variantKey(parsed.season, parsed.basename, v.name)),
    };
  }

  let original;
  try {
    const alreadyMirrored = await objectExists(s3, bucket, originalKey);
    original = alreadyMirrored
      ? null
      : await downloadFromSupabaseStorage(row.image_url);
  } catch (error) {
    return { status: "failed-download", card_key: row.card_key, error: formatError(error) };
  }

  try {
    if (original) {
      await uploadObject(s3, bucket, originalKey, original, getMimeType(parsed.filename));
    } else {
      // Original already mirrored by a prior partial run — re-download it for
      // variant generation instead of re-uploading it.
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: originalKey }));
      void head; // existence already confirmed; fetch bytes via download below
      original = await downloadFromSupabaseStorage(row.image_url);
    }
  } catch (error) {
    return { status: "failed-mirror-upload", card_key: row.card_key, originalKey, error: formatError(error) };
  }

  const produced = [];
  for (const variant of VARIANTS) {
    const key = variantKey(parsed.season, parsed.basename, variant.name);
    try {
      const exists = await objectExists(s3, bucket, key);
      if (exists) {
        produced.push({ variant: variant.name, key, uploaded: false });
        continue;
      }
      const buffer = await generateVariantBuffer(original, variant);
      await uploadObject(s3, bucket, key, buffer, "image/webp");
      produced.push({ variant: variant.name, key, uploaded: true, bytes: buffer.length });
    } catch (error) {
      return {
        status: "failed-variant",
        card_key: row.card_key,
        variant: variant.name,
        error: formatError(error),
      };
    }
  }

  const newPublicUrl = `${r2PublicBase}/${originalKey}`;
  const { error: updateError } = await supabase
    .from("card_images")
    .update({ image_url: newPublicUrl, thumbnail_url: newPublicUrl })
    .eq("id", row.id);

  if (updateError) {
    return {
      status: "failed-db-update",
      card_key: row.card_key,
      newPublicUrl,
      error: updateError.message,
    };
  }

  return { status: "synced", card_key: row.card_key, originalKey, newPublicUrl, produced };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
  const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = requireEnv("R2_BUCKET_NAME");
  const endpoint = requireEnv("R2_S3_ENDPOINT");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const r2PublicBase = R2_PUBLIC_BASE_URL;

  if (!supabaseUrl) throw new Error("Missing VITE_SUPABASE_URL environment variable.");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const s3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  console.log("Loading card_images rows from Supabase...");
  let rows = await fetchAllImageRows(supabase);
  console.log(`Loaded ${rows.length} total rows.`);

  if (args.cardKey) {
    rows = rows.filter((r) => r.card_key === args.cardKey);
    console.log(`Filtered to card_key=${args.cardKey}: ${rows.length} row(s).`);
  }

  let candidateRows = rows.filter((r) => parseSupabaseStorageUrl(r.image_url));
  console.log(`Rows still on Supabase Storage (sync candidates): ${candidateRows.length}`);

  if (args.limit) {
    candidateRows = candidateRows.slice(0, args.limit);
    console.log(`Limited to first ${candidateRows.length} candidates (--limit).`);
  }

  console.log(`Mode: ${args.dryRun ? "DRY RUN (no downloads/uploads/DB writes)" : "LIVE"}`);
  console.log("");

  const summary = {
    synced: 0,
    skippedNotSupabaseStorage: 0,
    dryRunWouldSync: 0,
    failedDownload: 0,
    failedMirrorUpload: 0,
    failedVariant: 0,
    failedDbUpdate: 0,
    variantsUploaded: 0,
    bytesUploaded: 0,
  };
  const failures = [];

  const results = await runPool(candidateRows, 8, (row) =>
    processRow(row, { supabase, s3, bucket, r2PublicBase, dryRun: args.dryRun }),
  );

  for (const result of results) {
    switch (result.status) {
      case "synced":
        summary.synced += 1;
        for (const p of result.produced) {
          if (p.uploaded) {
            summary.variantsUploaded += 1;
            summary.bytesUploaded += p.bytes ?? 0;
          }
        }
        console.log(`[SYNCED] ${result.card_key} -> ${result.newPublicUrl}`);
        break;
      case "skipped-not-supabase-storage":
        summary.skippedNotSupabaseStorage += 1;
        break;
      case "dry-run-would-sync":
        summary.dryRunWouldSync += 1;
        console.log(`[DRY-RUN] ${result.card_key} -> ${result.originalKey} + ${result.variantKeys.join(", ")}`);
        break;
      case "failed-download":
        summary.failedDownload += 1;
        failures.push(result);
        console.error(`[FAILED-DOWNLOAD] ${result.card_key}: ${result.error}`);
        break;
      case "failed-mirror-upload":
        summary.failedMirrorUpload += 1;
        failures.push(result);
        console.error(`[FAILED-MIRROR-UPLOAD] ${result.card_key}: ${result.error}`);
        break;
      case "failed-variant":
        summary.failedVariant += 1;
        failures.push(result);
        console.error(`[FAILED-VARIANT:${result.variant}] ${result.card_key}: ${result.error}`);
        break;
      case "failed-db-update":
        summary.failedDbUpdate += 1;
        failures.push(result);
        console.error(`[FAILED-DB-UPDATE] ${result.card_key}: ${result.error} (files already uploaded to R2 at this point — safe to re-run, will skip re-upload and retry the DB update)`);
        break;
      default:
        break;
    }
  }

  console.log("");
  console.log("Summary");
  console.log("-------");
  console.log(`Total rows:                    ${rows.length}`);
  console.log(`Sync candidates considered:    ${candidateRows.length}`);
  console.log(`Synced (R2 + variants + DB):   ${summary.synced}`);
  if (args.dryRun) console.log(`Would sync (dry-run):          ${summary.dryRunWouldSync}`);
  console.log(`Variant files uploaded:        ${summary.variantsUploaded}`);
  console.log(`Bytes uploaded (this run):     ${summary.bytesUploaded} (${(summary.bytesUploaded / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Failed downloads:              ${summary.failedDownload}`);
  console.log(`Failed mirror uploads:         ${summary.failedMirrorUpload}`);
  console.log(`Failed variant generation:     ${summary.failedVariant}`);
  console.log(`Failed DB updates:             ${summary.failedDbUpdate}`);

  if (failures.length > 0) {
    console.log("");
    console.log("Failures detail");
    console.log("----------------");
    for (const f of failures) console.log(JSON.stringify(f));
  }

  const totalFailures =
    summary.failedDownload + summary.failedMirrorUpload + summary.failedVariant + summary.failedDbUpdate;
  if (totalFailures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
