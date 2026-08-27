// One-time (or occasional) catch-up refresh of cards.ownership from the
// CARDS tab's real source columns -- column A (card_key) and column AZ
// (ownership) -- after real league trades changed who owns which cards.
//
// Deliberately NOT a general re-import: reads only 2 columns via a targeted
// Sheets API batchGet (never a full-tab export), and writes only rows whose
// ownership actually differs from the sheet -- never touches ratings,
// charts, or any other field. Matching logic (normalize whitespace/case,
// loud-fail on no-match) reused directly from publishedStatusMatching.mjs,
// since card_key here needs the exact same defensive handling.
//
// Per the CARD_PUBLISHED_STATUS_PLAN.md precedent, uses .update() per
// changed row rather than .upsert() -- every row already exists, and
// ownership values differ per row (unlike is_published's binary true/false,
// there's no shared value to group a batch .in() update around here), so a
// per-row .update() is both simpler and avoids the whole
// upsert/defaultToNull class of risk entirely.
//
// This script is expected to be a one-time (or occasional, staggered)
// catch-up tool for the trades that already happened via the old
// manual/workbook process -- not ongoing sync infrastructure. Once the
// real in-app Trades feature ships (currently a "Coming Soon" placeholder
// tile), cards.ownership becomes authoritative going forward and this
// script's job is done for good.
//
// Defaults to a dry run: reports every row whose sheet value differs from
// the DB, writes nothing. Pass --write to actually apply the changes.

import "dotenv/config";
import fs from "node:fs/promises";
import process from "node:process";
import { JWT } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";
import { buildCardKeyLookup, normalizeForMatch } from "./lib/publishedStatusMatching.mjs";

const SPREADSHEET_ID = "1u23DbvIv0w17rMVBfZb9jq6TGvE3bWDsaMRMUzICvgM";
const CARDS_TAB = "CARDS";
const DATA_START_ROW = 3; // confirmed this week: frozenRowCount 2, data starts row 3
const DATA_END_ROW = 200000;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function loadGoogleCredentials() {
  const credPath = requireEnv("GOOGLE_SHEETS_CREDENTIALS_PATH");
  const raw = await fs.readFile(credPath, "utf8");
  return JSON.parse(raw);
}

async function fetchOwnershipColumnRows() {
  const cred = await loadGoogleCredentials();
  const client = new JWT({
    email: cred.client_email,
    key: cred.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const ranges = [
    `${CARDS_TAB}!A${DATA_START_ROW}:A${DATA_END_ROW}`,  // card_key, direct
    `${CARDS_TAB}!AZ${DATA_START_ROW}:AZ${DATA_END_ROW}`, // ownership
  ];
  const query = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const res = await client.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${query}`,
  });

  const [cardKeyCol, ownershipCol] = res.data.valueRanges.map(
    (vr) => (vr.values || []).map((row) => row[0] ?? ""),
  );

  const rowCount = Math.max(cardKeyCol.length, ownershipCol.length);
  const rows = [];
  for (let i = 0; i < rowCount; i += 1) {
    const cardKey = cardKeyCol[i] ?? "";
    if (!cardKey) continue; // blank column A = no real row here, skip
    rows.push({
      sheetCardKey: cardKey,
      ownership: (ownershipCol[i] ?? "").trim() || null, // blank -> null, matching DB convention
      sourceRow: DATA_START_ROW + i,
    });
  }
  return rows;
}

async function loadRealCards(supabase) {
  const cards = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    // .order() is required, not optional -- confirmed by real failure this
    // week: unordered .range() pagination against this table returned
    // 135,203 rows but only 86,886 distinct card_keys (duplicates crowding
    // out genuine rows across page boundaries), spuriously "unresolving"
    // ~49,000 real sheet rows. Matches the established pattern already used
    // correctly in cardDatabase.ts/CardsPage.tsx's own pagination.
    const { data, error } = await supabase
      .from("cards")
      .select("card_key, ownership")
      .order("card_key", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    cards.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return cards;
}

async function main() {
  const write = process.argv.includes("--write");

  console.log(`Reading ownership column from ${CARDS_TAB} (columns A/AZ only)...`);
  const sheetRows = await fetchOwnershipColumnRows();
  console.log(`Fetched ${sheetRows.length} real card rows from the sheet.`);

  const supabaseUrl = requireEnv("VITE_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  console.log("Loading real cards (card_key + current ownership) for matching...");
  const realCards = await loadRealCards(supabase);
  console.log(`Loaded ${realCards.length} real cards.`);

  const lookup = buildCardKeyLookup(realCards.map((c) => c.card_key));
  const currentOwnershipByKey = new Map(realCards.map((c) => [c.card_key, c.ownership]));

  const changed = [];
  const unchanged = [];
  const unresolved = [];

  for (const row of sheetRows) {
    const realCardKey = lookup.get(normalizeForMatch(row.sheetCardKey));
    if (!realCardKey) {
      unresolved.push(row);
      continue;
    }
    const currentOwnership = currentOwnershipByKey.get(realCardKey) ?? null;
    if (currentOwnership === row.ownership) {
      unchanged.push({ cardKey: realCardKey });
    } else {
      changed.push({ cardKey: realCardKey, from: currentOwnership, to: row.ownership });
    }
  }

  console.log("");
  console.log("=== Summary ===");
  console.log(`Matched: ${changed.length + unchanged.length} / Unresolved: ${unresolved.length}`);
  console.log(`Unchanged (sheet already matches DB): ${unchanged.length}`);
  console.log(`Changed (real diff -- traded cards and/or corrections): ${changed.length}`);

  if (unresolved.length > 0) {
    console.log("");
    console.log("=== Unresolved rows (first 25) -- logged loudly, never silently dropped ===");
    for (const row of unresolved.slice(0, 25)) {
      console.log(`  sheet row ${row.sourceRow}: "${row.sheetCardKey}" (ownership="${row.ownership}")`);
    }
    if (unresolved.length > 25) console.log(`  ...and ${unresolved.length - 25} more.`);
  }

  if (changed.length > 0) {
    console.log("");
    console.log("=== Full diff list (every row that would change) ===");
    for (const c of changed) {
      console.log(`  ${c.cardKey}: "${c.from ?? "(none)"}" -> "${c.to ?? "(none)"}"`);
    }
  }

  if (!write) {
    console.log("");
    console.log("Dry run only -- no writes made. Re-run with --write to apply.");
    return;
  }

  console.log("");
  console.log(`--write passed. Updating ownership for ${changed.length} changed cards...`);
  for (const c of changed) {
    const { error } = await supabase.from("cards").update({ ownership: c.to }).eq("card_key", c.cardKey);
    if (error) throw error;
    console.log(`  updated ${c.cardKey}: "${c.from ?? "(none)"}" -> "${c.to ?? "(none)"}"`);
  }
  console.log("Done.");
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
