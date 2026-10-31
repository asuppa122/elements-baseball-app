// READ-ONLY inventory of everything gameplay has written that official
// competitive progression could read, for the pre-launch cleanup plan
// (supabase/data-fixes/20261031_prelaunch_progression_archive.sql).
//
// Service-role key, SELECT only: no write path in this file and no flag that
// adds one.
//
//   node scripts/inventory-prelaunch-progression.mjs

import "dotenv/config";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const must = ({ data, error }) => { if (error) throw error; return data; };

const profiles = must(await db.from("profiles").select("user_id, manager_name"));
const nameOf = new Map(profiles.map((p) => [p.user_id, p.manager_name]));
const who = (id) => nameOf.get(id) ?? id;

// 1. Completed games -- the only games that ever wrote progression.
const games = must(await db.from("games").select("id, status, home_user_id, away_user_id, season_id, completed_at, created_at, game_state->turnHandshake, game_state->score").order("created_at"));
const completed = games.filter((g) => g.status === "complete");
console.log(`\n== Completed games: ${completed.length} of ${games.length} ==`);
console.table(completed.map((g) => ({
  id: g.id, type: g.turnHandshake === true ? "two-player" : "one-screen",
  home: who(g.home_user_id), away: who(g.away_user_id), season: g.season_id,
  score: g.score ? `${g.score.away}-${g.score.home}` : "-", completed: g.completed_at?.slice(0, 16),
})));

// 2. Game counts as the writer computes them (completed games per manager per season).
const counts = {};
for (const g of completed) for (const u of [g.home_user_id, g.away_user_id]) {
  const k = `${who(u)} / ${g.season_id}`; counts[k] = (counts[k] ?? 0) + 1;
}
console.log("\n== Completed-game counts used for rest milestones (manager / season) ==");
console.table(Object.entries(counts).map(([k, n]) => ({ manager_season: k, completed_games: n })));

// 3. Persistent rest -- every row was written by a game completion.
const rest = must(await db.from("player_rest_state").select("user_id, season_id, card_key, hitter_games_remaining, pitcher_games_remaining, updated_at").order("updated_at"));
console.log(`\n== player_rest_state rows: ${rest.length} ==`);
const byUser = {};
for (const r of rest) { const k = `${who(r.user_id)} / ${r.season_id}`; byUser[k] = byUser[k] ?? { rows: 0, nonzero: 0, last: "" }; byUser[k].rows += 1; if (r.hitter_games_remaining || r.pitcher_games_remaining) byUser[k].nonzero += 1; if (r.updated_at > byUser[k].last) byUser[k].last = r.updated_at.slice(0, 16); }
console.table(Object.entries(byUser).map(([k, v]) => ({ manager_season: k, ...v })));
// Which completion wrote each row: rows written by one completion share its completed_at.
const completionAt = new Map(completed.map((g) => [g.completed_at?.slice(0, 19), g]));
const traced = rest.filter((r) => completionAt.has(r.updated_at.slice(0, 19))).length;
console.log(`rows whose updated_at matches a game completion: ${traced} of ${rest.length}`);

// 4. Milestone reward claims and items (Prize Packs).
// (20260811_milestone_reward_groundwork.sql may never have been applied.)
const claimsRes = await db.from("milestone_reward_claims").select("id, user_id, season_key, category, milestone_key, status, created_at");
if (claimsRes.error) console.log(`\n== milestone_reward_claims: not in the live database (${claimsRes.error.code}) ==`);
else {
  const items = must(await db.from("milestone_reward_items").select("id"));
  console.log(`\n== milestone_reward_claims: ${claimsRes.data.length}, milestone_reward_items: ${items.length} ==`);
  if (claimsRes.data.length) console.table(claimsRes.data.map((c) => ({ ...c, user_id: who(c.user_id) })));
}

// 5. Other gameplay tables (logs and dice: history, not progression).
const countOf = async (t) => { const { count, error } = await db.from(t).select("*", { count: "exact" }).limit(1); if (error) throw error; return count; };
console.log(`\n== game_events: ${await countOf("game_events")}, game_rolls: ${await countOf("game_rolls")} (history only) ==`);

// 6. Tables that would hold appearances, usage, stats or standings, if any exist.
console.log("\n== Probing for other progression tables ==");
for (const t of ["player_appearances", "player_usage", "game_stats", "player_stats", "standings", "season_standings", "manager_records", "game_results", "rankings"]) {
  const { error } = await db.from(t).select("*").limit(1);
  console.log(`${t}: ${error ? `does not exist (${error.code})` : "EXISTS"}`);
}
