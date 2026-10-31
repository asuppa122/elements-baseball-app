// READ-ONLY local snapshot of the live gameplay tables, taken just before a
// gameplay migration as a recovery source alongside Supabase's own backups.
// Writes JSON files to backups/gameplay-<timestamp>/ (git-ignored); it only
// SELECTs, 1000 rows a page.
//
//   node scripts/snapshot-gameplay-tables.mjs

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const TABLES = ["games", "game_events", "game_rolls", "player_rest_state", "gameplay_feature_access", "profiles"];
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const out = path.join(import.meta.dirname, "..", "backups", `gameplay-${new Date().toISOString().replace(/[:.]/g, "-")}`);
fs.mkdirSync(out, { recursive: true });

for (const table of TABLES) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  fs.writeFileSync(path.join(out, `${table}.json`), JSON.stringify(rows, null, 1));
  console.log(`${table}: ${rows.length} rows`);
}
console.log(`\nSnapshot written to ${out}`);
