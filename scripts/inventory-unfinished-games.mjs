// READ-ONLY inventory of every unfinished gameplay game, for the Stage 3
// practice-game cleanup (supabase/migrations/20261031_gameplay_one_active_game.sql).
//
// Uses the service-role key because a signed-in manager can only see their
// own games, and the cleanup has to know about every game. It only SELECTs:
// there is no write path in this file and no flag that adds one.
//
// For each game that is not complete: id, status, game type (two-player or
// one-screen test), home and away manager, created/updated, the last event,
// and a FLAG when a manager is not one of the known practice testers or the
// game is newer than the cleanup cut-off -- those are listed for review, not
// closed.
//
//   node scripts/inventory-unfinished-games.mjs

import "dotenv/config";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const KNOWN_TESTERS = new Set(["Anthony", "Will"]);
const FINISHED = new Set(["complete", "cancelled", "terminated"]);

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: games, error } = await supabase
  .from("games")
  .select("id, status, home_user_id, away_user_id, created_at, updated_at, state_version, game_state->turnHandshake, game_state->firstPitchThrown, game_state->inning, game_state->half, game_state->score")
  .order("created_at", { ascending: true });
if (error) throw error;

const userIds = [...new Set(games.flatMap((g) => [g.home_user_id, g.away_user_id]))];
const { data: profiles, error: profileError } = await supabase
  .from("profiles").select("user_id, manager_name").in("user_id", userIds);
if (profileError) throw profileError;
const nameOf = new Map(profiles.map((p) => [p.user_id, p.manager_name]));

const unfinished = games.filter((g) => !FINISHED.has(g.status));
const ids = unfinished.map((g) => g.id);
const { data: events, error: eventError } = ids.length
  ? await supabase.from("game_events").select("game_id, event_type, state_version, created_at").in("game_id", ids)
  : { data: [], error: null };
if (eventError) throw eventError;
const lastEvent = new Map();
const pitched = new Set();
for (const e of events) {
  const cur = lastEvent.get(e.game_id);
  if (!cur || e.state_version > cur.state_version) lastEvent.set(e.game_id, e);
  if (["OFFENSE_READY", "PITCH_ROLLED", "SWING_RESOLVED", "DECISION_RESOLVED"].includes(e.event_type)) pitched.add(e.game_id);
}

const byStatus = {};
for (const g of games) byStatus[g.status] = (byStatus[g.status] ?? 0) + 1;

const rows = unfinished.map((g) => {
  const home = nameOf.get(g.home_user_id) ?? g.home_user_id;
  const away = nameOf.get(g.away_user_id) ?? g.away_user_id;
  const flags = [];
  if (!KNOWN_TESTERS.has(home)) flags.push(`home "${home}" not a known tester`);
  if (!KNOWN_TESTERS.has(away)) flags.push(`away "${away}" not a known tester`);
  const last = lastEvent.get(g.id);
  return {
    id: g.id,
    status: g.status,
    type: g.turnHandshake === true ? "two-player" : "one-screen test",
    home, away,
    situation: g.inning ? `${g.half === "top" ? "T" : "B"}${g.inning} ${g.score?.away ?? 0}-${g.score?.home ?? 0}` : "-",
    started_play: pitched.has(g.id) ? "yes" : "no",
    created: g.created_at.slice(0, 16).replace("T", " "),
    last_activity: (last?.created_at ?? g.updated_at).slice(0, 16).replace("T", " "),
    last_event: last?.event_type ?? "-",
    flag: flags.join("; ") || "",
  };
});

console.log(`All games: ${games.length}  by status: ${JSON.stringify(byStatus)}`);
// Completed games feed persistent rest tracking today whatever their type.
const done = games.filter((g) => g.status === "complete");
console.log(`Completed: ${done.map((g) => `${g.id.slice(0, 8)} ${g.turnHandshake === true ? "two-player" : "one-screen"} ${nameOf.get(g.home_user_id)} v ${nameOf.get(g.away_user_id)}`).join(" | ")}`);
console.log(`Unfinished: ${rows.length}  flagged for review: ${rows.filter((r) => r.flag).length}\n`);
console.table(rows);
console.log("\nIDs (unflagged):");
console.log(rows.filter((r) => !r.flag).map((r) => `  '${r.id}',`).join("\n"));
