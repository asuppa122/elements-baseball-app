// One-time/occasional refresh of src/data/standings.ts from the STANDINGS
// tab, after real games get recorded in the workbook. Confirmed live before
// writing any logic against it: header row 2, all-time in columns A-K
// (Name/Wins/Losses/Total/Win%/RS/RA/RS-G/RA-G/RD/RD%), Season 10.1 in
// columns L-T (Wins/Losses/Total/Win%/RS/RA/RS-G/RA-G/RD -- no RD% column
// there). Derived columns (Win%, RS/G, RA/G, RD, RD%) are never read --
// StandingsPage.tsx already computes all of them client-side from
// wins/losses/games/rs/ra, confirmed by checking the sheet's own RD% values
// exactly equal RS/RA. A "League Totals" row and blank spacer rows exist
// below the real managers and must be excluded.
//
// Unlike every other sync script this session, this data doesn't live in
// Supabase -- it's a static TS file bundled at build time. "Write" here
// means regenerating src/data/standings.ts itself; nothing takes effect
// until that file is actually committed, built, and deployed, which is a
// real review checkpoint (git diff) this pipeline gets for free on top of
// the dry-run below.
//
// Defaults to a dry run: prints a real field-by-field diff against the
// CURRENT file's arrays, writes nothing. Pass --write to regenerate the
// file.

import "dotenv/config";
import fs from "node:fs/promises";
import process from "node:process";
import { JWT } from "google-auth-library";
import { CURRENT_STANDINGS, ALL_TIME_STANDINGS } from "../src/data/standings.ts";

const SPREADSHEET_ID = "1u23DbvIv0w17rMVBfZb9jq6TGvE3bWDsaMRMUzICvgM";
const STANDINGS_TAB = "STANDINGS";
const DATA_START_ROW = 3; // row 2 (0-indexed) is the header; data starts row 3
const DATA_END_ROW = 60; // real sheet is 29 rows total; generous margin

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

function parseNumber(text) {
  const trimmed = String(text ?? "").trim().replaceAll(",", "");
  if (trimmed === "") return 0;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : 0;
}

async function fetchStandingsRows() {
  const cred = await loadGoogleCredentials();
  const client = new JWT({
    email: cred.client_email,
    key: cred.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  // Named ranges for exactly the raw columns needed: A/B/C/D/F/G (all-time
  // name/wins/losses/games/rs/ra) and L/M/N/P/Q (season wins/losses/games/
  // rs/ra) -- deliberately skips every derived column (Win%, RS/G, RA/G,
  // RD, RD%) since the app computes those itself.
  const ranges = [
    `${STANDINGS_TAB}!A${DATA_START_ROW}:A${DATA_END_ROW}`,
    `${STANDINGS_TAB}!B${DATA_START_ROW}:B${DATA_END_ROW}`,
    `${STANDINGS_TAB}!C${DATA_START_ROW}:C${DATA_END_ROW}`,
    `${STANDINGS_TAB}!D${DATA_START_ROW}:D${DATA_END_ROW}`,
    `${STANDINGS_TAB}!F${DATA_START_ROW}:F${DATA_END_ROW}`,
    `${STANDINGS_TAB}!G${DATA_START_ROW}:G${DATA_END_ROW}`,
    `${STANDINGS_TAB}!L${DATA_START_ROW}:L${DATA_END_ROW}`,
    `${STANDINGS_TAB}!M${DATA_START_ROW}:M${DATA_END_ROW}`,
    `${STANDINGS_TAB}!N${DATA_START_ROW}:N${DATA_END_ROW}`,
    `${STANDINGS_TAB}!P${DATA_START_ROW}:P${DATA_END_ROW}`,
    `${STANDINGS_TAB}!Q${DATA_START_ROW}:Q${DATA_END_ROW}`,
  ];
  const query = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const res = await client.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${query}`,
  });

  const cols = res.data.valueRanges.map((vr) => (vr.values || []).map((row) => row[0] ?? ""));
  const [name, atWins, atLosses, atTotal, atRs, atRa, sWins, sLosses, sTotal, sRs, sRa] = cols;

  const rowCount = name.length;
  const allTime = [];
  const current = [];

  for (let i = 0; i < rowCount; i += 1) {
    const manager = String(name[i] ?? "").trim();
    if (!manager || manager === "League Totals") continue; // blank spacer or totals row

    allTime.push({
      manager,
      wins: parseNumber(atWins[i]),
      losses: parseNumber(atLosses[i]),
      games: parseNumber(atTotal[i]),
      rs: parseNumber(atRs[i]),
      ra: parseNumber(atRa[i]),
    });

    const seasonGames = parseNumber(sTotal[i]);
    if (seasonGames > 0) {
      current.push({
        manager,
        wins: parseNumber(sWins[i]),
        losses: parseNumber(sLosses[i]),
        games: seasonGames,
        rs: parseNumber(sRs[i]),
        ra: parseNumber(sRa[i]),
      });
    }
  }

  return { current, allTime };
}

function diffRows(label, oldRows, newRows) {
  const oldByManager = new Map(oldRows.map((r) => [r.manager, r]));
  const newByManager = new Map(newRows.map((r) => [r.manager, r]));
  const allManagers = new Set([...oldByManager.keys(), ...newByManager.keys()]);
  const changed = [];
  const added = [];
  const removed = [];

  for (const manager of allManagers) {
    const oldRow = oldByManager.get(manager);
    const newRow = newByManager.get(manager);
    if (!oldRow) { added.push(newRow); continue; }
    if (!newRow) { removed.push(oldRow); continue; }
    const fields = ["wins", "losses", "games", "rs", "ra"];
    const fieldDiffs = fields.filter((f) => oldRow[f] !== newRow[f]);
    if (fieldDiffs.length > 0) {
      changed.push({ manager, old: oldRow, new: newRow, fieldDiffs });
    }
  }

  console.log(`\n=== ${label}: ${changed.length} changed, ${added.length} added, ${removed.length} removed ===`);
  for (const c of changed) {
    const parts = c.fieldDiffs.map((f) => `${f} ${c.old[f]}->${c.new[f]}`).join(", ");
    console.log(`  ${c.manager}: ${parts}`);
  }
  for (const a of added) console.log(`  + ${a.manager}: new row (${a.wins}-${a.losses}, ${a.games} games)`);
  for (const r of removed) console.log(`  - ${r.manager}: no longer present (was ${r.wins}-${r.losses}, ${r.games} games)`);

  return changed.length + added.length + removed.length;
}

function formatRow(row) {
  return `  {manager:'${row.manager}',wins:${row.wins},losses:${row.losses},games:${row.games},rs:${row.rs},ra:${row.ra}},`;
}

function buildFileContent(current, allTime) {
  return `export type StandingRow = {
  manager: string
  wins: number
  losses: number
  games: number
  rs: number
  ra: number
  sourceName?: string
}

// Source of truth: Document1 -> STANDINGS workbook, synced via
// scripts/import-standings-refresh.mjs on ${new Date().toISOString().slice(0, 10)}.
// Current standings include only managers with at least one Season 10.1 game.
export const CURRENT_STANDINGS: StandingRow[] = [
${current.map(formatRow).join("\n")}
]

// Display/reference only. All-time values NEVER feed Season 10 milestone progress.
// Source of truth: Document1 -> STANDINGS -> Overall Standings.
export const ALL_TIME_STANDINGS: StandingRow[] = [
${allTime.map(formatRow).join("\n")}
]
`;
}

async function main() {
  const write = process.argv.includes("--write");

  console.log(`Reading ${STANDINGS_TAB} (columns A/B/C/D/F/G + L/M/N/P/Q only)...`);
  const { current, allTime } = await fetchStandingsRows();
  console.log(`Fetched ${allTime.length} all-time rows, ${current.length} with a Season 10.1 game.`);

  const currentChanges = diffRows("Current Standings", CURRENT_STANDINGS, current);
  const allTimeChanges = diffRows("All-Time Standings", ALL_TIME_STANDINGS, allTime);

  if (!write) {
    console.log("\nDry run only -- no file changes made. Re-run with --write to apply.");
    return;
  }

  if (currentChanges === 0 && allTimeChanges === 0) {
    console.log("\nNo changes to apply -- file already matches the sheet.");
    return;
  }

  console.log("\n--write passed. Regenerating src/data/standings.ts...");
  const content = buildFileContent(current, allTime);
  await fs.writeFile(new URL("../src/data/standings.ts", import.meta.url), content);
  console.log("Done. Review the diff (git diff src/data/standings.ts), then build/test/commit as usual.");
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
