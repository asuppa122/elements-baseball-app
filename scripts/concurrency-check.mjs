// Genuine concurrency check for the one-active-game rule
// (supabase/migrations/20261031_gameplay_one_active_game.sql) on a REAL
// PostgreSQL server -- many separate connections at once, which PGlite (one
// connection) cannot do.
//
// Throwaway and isolated: it creates a new cluster in a temp folder, on a
// private Unix socket with TCP off, runs every gameplay migration, races the
// requests, prints the results, then stops the server and deletes the folder.
// It never connects to Supabase and reads no .env.
//
//   node scripts/concurrency-check.mjs            (needs Homebrew postgresql@17)
//   PG_BIN=/path/to/postgres/bin node scripts/concurrency-check.mjs

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";

const BIN = process.env.PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
const MIGRATIONS = [
  "20260818_gameplay_phase1_foundation.sql", "20260818_gameplay_phase1a_private_lab.sql",
  "20260818_gameplay_phase1b_pregame_state.sql", "20260818_gameplay_phase1d_start_state.sql",
  "20260818_gameplay_phase2a_pitch_roll.sql", "20260818_gameplay_build1_core_game.sql",
  "20260826_gameplay_player_rest_state.sql", "20260826_gameplay_rest_tracking_on_completion.sql",
  "20260827_gameplay_away_side_access.sql", "20261029_gameplay_two_player.sql",
  "20261030_gameplay_rest_appearance_fix.sql", "20261031_gameplay_one_active_game.sql",
].map((f) => path.join(import.meta.dirname, "..", "supabase", "migrations", f));

// Short on purpose: a Unix socket path must stay under ~100 characters on macOS.
const dir = fs.mkdtempSync(path.join(os.platform() === "darwin" ? "/tmp" : os.tmpdir(), "epg-"));
const data = path.join(dir, "data");
const PORT = "54329";
// Postgres on macOS refuses to start without a valid locale (Homebrew says so too).
const env = { ...process.env, LC_ALL: "en_US.UTF-8" };
const pg = (args, opts = {}) => execFileSync(path.join(BIN, args[0]), args.slice(1), { stdio: "pipe", env, ...opts }).toString();
const psqlArgs = ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", dir, "-p", PORT, "-U", "postgres", "-d", "postgres"];
const sql = (text) => pg(["psql", ...psqlArgs, "-c", text]).trim();
const sqlFile = (file) => pg(["psql", ...psqlArgs, "-f", file]);

/** One request on its own connection; resolves with ok or the error text. */
function request(text) {
  return new Promise((resolve) => {
    const p = spawn(path.join(BIN, "psql"), [...psqlArgs, "-c", text], { env });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: err.trim() }));
  });
}
const asUser = (uid, body) => `set role authenticated; select set_config('test.uid', '${uid}', false); ${body}`;
const gameJson = (home, away) => JSON.stringify({
  gameId: randomUUID(), status: "pregame", stateVersion: 1, turnHandshake: true,
  configuration: { seasonId: "concurrency", mlbYear: 1925 },
  managers: { home: { userId: home, managerName: "H" }, away: { userId: away, managerName: "A" } },
  pregame: { home: {}, away: {} },
});
const create = (home, away) => asUser(home, `select public.create_gameplay_game('${gameJson(home, away)}'::jsonb);`);
const tally = (results) => ({
  succeeded: results.filter((r) => r.ok).length,
  refusedActiveGame: results.filter((r) => !r.ok && /ACTIVE_GAME_(HOME|AWAY)/.test(r.error)).length,
  otherErrors: results.filter((r) => !r.ok && !/ACTIVE_GAME_(HOME|AWAY)/.test(r.error)).map((r) => r.error.split("\n")[0]),
});

let failed = false;
const check = (label, cond, detail) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  ${JSON.stringify(detail)}` : ""}`); if (!cond) failed = true; };

try {
  pg(["initdb", "-D", data, "-U", "postgres", "-A", "trust", "--no-sync"]);
  pg(["pg_ctl", "-D", data, "-l", path.join(dir, "log"), "-w", "-o", `-p ${PORT} -k ${dir} -c listen_addresses='' -c max_connections=200`, "start"]);
  console.log(`Postgres ${sql("show server_version")} running in ${dir} (socket only)\n`);

  // Supabase stand-ins: auth.uid() from a session setting, the authenticated role, profiles.
  sql(`create role authenticated nologin; create role anon nologin; create role service_role nologin;
       create schema auth; create table auth.users (id uuid primary key);
       create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
       create table public.profiles (user_id uuid primary key references auth.users(id), manager_name text not null unique, avatar_url text);
       grant usage on schema public, auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for (const m of MIGRATIONS) sqlFile(m);
  sql("grant select, insert, update, delete on all tables in schema public to authenticated;");

  const users = Array.from({ length: 50 }, (_, i) => ({ id: randomUUID(), name: `M${i}` }));
  sql(`insert into auth.users values ${users.map((u) => `('${u.id}')`).join(",")};
       insert into public.profiles (user_id, manager_name) values ${users.map((u) => `('${u.id}', '${u.name}')`).join(",")};
       insert into public.gameplay_feature_access (user_id) values ${users.map((u) => `('${u.id}')`).join(",")};`);
  const [A, X, ...rest] = users;

  // 1. One manager, 20 simultaneous creations against 20 different opponents.
  const r1 = tally(await Promise.all(rest.slice(0, 20).map((b) => request(create(A.id, b.id)))));
  const aGames = Number(sql(`select count(*) from public.games where (home_user_id = '${A.id}' or away_user_id = '${A.id}') and not public.gameplay_is_ended(status)`));
  const aRows = Number(sql(`select count(*) from public.gameplay_active_games where user_id = '${A.id}'`));
  check("20 simultaneous games for one manager: exactly one commits", r1.succeeded === 1 && r1.refusedActiveGame === 19 && aGames === 1 && aRows === 1, { ...r1, unfinishedGamesForManager: aGames, registryRows: aRows });

  // 2. 20 different managers challenge the same opponent at once.
  const homes = rest.slice(20, 40);
  const r2 = tally(await Promise.all(homes.map((h) => request(create(h.id, X.id)))));
  const xGames = Number(sql(`select count(*) from public.games where away_user_id = '${X.id}' and not public.gameplay_is_ended(status)`));
  const strays = Number(sql(`select count(*) from public.gameplay_active_games where user_id in (${homes.map((h) => `'${h.id}'`).join(",")})`));
  check("20 managers challenge one opponent at once: exactly one game; no refused challenger left registered", r2.succeeded === 1 && r2.refusedActiveGame === 19 && xGames === 1 && strays === 1, { ...r2, opponentGames: xGames, challengersRegistered: strays });

  // 3. The same race as the database owner, bypassing the server function and its pre-check.
  sql("update public.games set status = 'terminated' where not public.gameplay_is_ended(status)");
  const owner = (home, away) => `insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state) values ('${randomUUID()}', 'c', 1925, 'pregame', '${home}', '${away}', '{}', '{"turnHandshake": true}');`;
  const r3 = tally(await Promise.all(rest.slice(0, 20).map((b) => request(owner(A.id, b.id)))));
  check("20 simultaneous direct inserts (no server function): exactly one commits", r3.succeeded === 1 && r3.refusedActiveGame === 19, r3);

  // 4. Interleaving: B starts while A's creation is still uncommitted -> B waits, then is refused.
  sql("update public.games set status = 'terminated' where not public.gameplay_is_ended(status)");
  const [b1, b2] = rest.slice(40, 42);
  const t0 = Date.now();
  const first = request(create(A.id, b1.id).replace(/;\s*$/, "; select pg_sleep(2);"));
  await new Promise((r) => setTimeout(r, 500));
  const second = await request(create(A.id, b2.id));
  const waited = Date.now() - t0;
  const firstResult = await first;
  check("a request during an uncommitted creation waits for it, then is refused", firstResult.ok && !second.ok && /ACTIVE_GAME_HOME/.test(second.error) && waited >= 1800, { waitedMs: waited });

  // 5. ...and if the first rolls back, the waiting one succeeds -- nothing stale is left.
  sql("update public.games set status = 'terminated' where not public.gameplay_is_ended(status)");
  const [c1, c2] = rest.slice(42, 44);
  const doomed = request(`begin; ${create(A.id, c1.id)} select pg_sleep(2); rollback;`);
  await new Promise((r) => setTimeout(r, 500));
  const after = await request(create(A.id, c2.id));
  await doomed;
  const rows = sql(`select game_id from public.gameplay_active_games where user_id = '${A.id}'`).split("\n").filter(Boolean).length;
  check("if the first creation rolls back, the waiting one succeeds and only it is registered", after.ok && rows === 1, { waitingSucceeded: after.ok, registryRows: rows });

  // 6. Two requests ending the same game at once (cancel + cancel): one wins, the other is told it ended.
  const g = sql(`select game_id from public.gameplay_active_games where user_id = '${A.id}'`);
  const [cA, cB] = await Promise.all([A.id, c2.id].map((u) => request(asUser(u, `select public.cancel_gameplay_game('${g}');`))));
  const cancelled = [cA, cB].filter((r) => r.ok).length;
  check("both managers cancel at the same moment: one cancels, the other is told it already ended; both released",
    cancelled === 1 && [cA, cB].some((r) => !r.ok && /already ended/.test(r.error)) && Number(sql("select count(*) from public.gameplay_active_games")) === 0,
    { cancelled, errors: [cA, cB].filter((r) => !r.ok).map((r) => r.error.split("\n")[0]) });
} catch (e) {
  failed = true
  console.error(e.stderr?.toString() || e.message)
  try { console.error(fs.readFileSync(path.join(dir, "log"), "utf8").slice(-2000)) } catch { /* no log */ }
} finally {
  try { pg(["pg_ctl", "-D", data, "-m", "fast", "-w", "stop"]); } catch { /* not started */ }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\nServer stopped; ${dir} removed.`);
}
process.exit(failed ? 1 : 0);
