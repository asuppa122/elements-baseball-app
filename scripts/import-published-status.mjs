// Reads the CARDS tab's Published column (Option 2,
// CARD_PUBLISHED_STATUS_PLAN.md) and reports how it would update
// cards.is_published. Requests only the 2 columns actually needed -- A
// (card_key) and BA (Published) -- via the Sheets API, never a full-tab CSV
// export, so this never materializes a new tab or grows the workbook.
//
// Confirmed live before writing this (not assumed), in this order:
// 1. "Published" is column BA, literal lowercase "yes"/"no" values, header
//    text sitting in the workbook's row-1 group-label row rather than row
//    2's per-column headers; data starts at row 3 (frozenRowCount: 2).
// 2. Column A is NOT built here from Player Name/Year/Tm -- checking
//    card-source.mjs showed card_key comes straight from padded[0], i.e.
//    column A itself. Verified directly: column A already holds the exact
//    pre-normalized card_key text (e.g. "Eduardo Rodriguez 2025 ARI"),
//    while the separate "Player Name" column (E) keeps the accented
//    display spelling ("Eduardo Rodríguez"). An earlier version of this
//    script reconstructed the key from Player Name+Year+Tm and got 7,885
//    false unresolved rows from exactly this mismatch -- reading column A
//    directly is both simpler and correct by construction, since it's the
//    literal source card-source.mjs already uses for card_key.
//
// Defaults to a dry run: reports what WOULD change, writes nothing. Pass
// --write to actually upsert cards.is_published. Per this repo's standing
// rule, --write must be the explicit, singular, confirmed purpose of a run
// -- never bundled into routine investigation.

import "dotenv/config";
import fs from "node:fs/promises";
import process from "node:process";
import { JWT } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";
import {
  buildCardKeyLookup,
  resolvePublishedRows,
} from "./lib/publishedStatusMatching.mjs";

const SPREADSHEET_ID = "1u23DbvIv0w17rMVBfZb9jq6TGvE3bWDsaMRMUzICvgM";
const CARDS_TAB = "CARDS";
// Confirmed live: header row 2 (0-indexed row1's "Published" label sits
// above row 2's per-column headers), data starts row 3.
const DATA_START_ROW = 3;
const DATA_END_ROW = 200000; // generous upper bound; real sheet has ~135k rows

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
}

async function loadGoogleCredentials() {
  const credPath = requireEnv("GOOGLE_SHEETS_CREDENTIALS_PATH");
  const raw = await fs.readFile(credPath, "utf8");
  return JSON.parse(raw);
}

async function fetchPublishedColumnRows() {
  const cred = await loadGoogleCredentials();
  const client = new JWT({
    email: cred.client_email,
    key: cred.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const ranges = [
    `${CARDS_TAB}!A${DATA_START_ROW}:A${DATA_END_ROW}`, // card_key, direct
    `${CARDS_TAB}!BA${DATA_START_ROW}:BA${DATA_END_ROW}`, // Published
  ];
  const query = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const res = await client.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${query}`,
  });

  const [cardKeyCol, publishedCol] = res.data.valueRanges.map(
    (vr) => (vr.values || []).map((row) => row[0] ?? ""),
  );

  const rowCount = Math.max(cardKeyCol.length, publishedCol.length);
  const rows = [];
  for (let i = 0; i < rowCount; i += 1) {
    const cardKey = cardKeyCol[i] ?? "";
    if (!cardKey) continue; // blank column A = no real row here, skip
    // resolvePublishedRows joins player+year+team with spaces -- passing
    // the already-complete card_key as `player` with empty year/team is
    // exactly equivalent after normalizeForMatch's whitespace collapse,
    // and keeps this script using the same defensive matching module
    // (loud-fail on no-match) rather than a second bespoke comparison.
    rows.push({
      player: cardKey,
      year: "",
      team: "",
      published: publishedCol[i] ?? "",
      sourceTab: CARDS_TAB,
      sourceRow: DATA_START_ROW + i,
    });
  }
  return rows;
}

async function loadRealCardKeys(supabase) {
  const keys = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("cards")
      .select("card_key")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) keys.push(row.card_key);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return keys;
}

async function main() {
  const write = process.argv.includes("--write");

  console.log(`Reading Published column from ${CARDS_TAB} (columns A/BA only)...`);
  const sheetRows = await fetchPublishedColumnRows();
  console.log(`Fetched ${sheetRows.length} real card rows from the sheet.`);

  const supabaseUrl = requireEnv("VITE_SUPABASE_URL") || getSupabaseUrl();
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  console.log("Loading real card_keys from public.cards for matching...");
  const realCardKeys = await loadRealCardKeys(supabase);
  console.log(`Loaded ${realCardKeys.length} real card_keys.`);

  const lookup = buildCardKeyLookup(realCardKeys);
  const { resolved, unresolved } = resolvePublishedRows(sheetRows, lookup);

  const wouldPublish = resolved.filter((r) => r.isPublished);
  const wouldUnpublish = resolved.filter((r) => !r.isPublished);

  console.log("");
  console.log("=== Summary ===");
  console.log(`Resolved (matched a real card_key): ${resolved.length}`);
  console.log(`  -> is_published: true  : ${wouldPublish.length}`);
  console.log(`  -> is_published: false : ${wouldUnpublish.length}`);
  console.log(`Unresolved (no matching card_key -- logged loudly, never silently dropped): ${unresolved.length}`);

  if (unresolved.length > 0) {
    console.log("");
    console.log("=== Unresolved rows (first 25) ===");
    for (const row of unresolved.slice(0, 25)) {
      console.log(`  sheet row ${row.sourceRow}: "${row.player}" / ${row.year} / ${row.team} / published="${row.published}"`);
    }
    if (unresolved.length > 25) console.log(`  ...and ${unresolved.length - 25} more.`);
  }

  if (!write) {
    console.log("");
    console.log("Dry run only -- no writes made. Re-run with --write to apply.");
    return;
  }

  console.log("");
  console.log(`--write passed. Updating is_published for ${resolved.length} matched cards...`);
  // Deliberately .update() grouped by target value, not .upsert(). Every one
  // of these rows already exists (matched against real card_keys just
  // loaded), so this was never actually an upsert -- and .upsert()'s bulk
  // path defaults to defaultToNull: true, which pads/nulls columns not in
  // the payload (confirmed by reading node_modules/@supabase/supabase-js's
  // source directly) and hit player_name's NOT NULL constraint on a real
  // attempt: see git history for the failed first run. .update() only ever
  // touches the column(s) named in its argument -- it cannot null anything
  // else regardless of internal padding behavior.
  const batchSize = 200; // keep the .in() filter's URL length comfortably small
  async function updateGroup(cardKeys, isPublished) {
    for (let i = 0; i < cardKeys.length; i += batchSize) {
      const batch = cardKeys.slice(i, i + batchSize);
      const { error } = await supabase.from("cards").update({ is_published: isPublished }).in("card_key", batch);
      if (error) throw error;
      console.log(`  is_published=${isPublished}: ${Math.min(i + batchSize, cardKeys.length)} / ${cardKeys.length}`);
    }
  }
  await updateGroup(wouldPublish.map((r) => r.cardKey), true);
  await updateGroup(wouldUnpublish.map((r) => r.cardKey), false);
  console.log("Done.");
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
