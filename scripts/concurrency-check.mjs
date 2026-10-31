// Genuine concurrency check for the one-active-game rule
// (supabase/migrations/20261031_gameplay_one_active_game.sql) on a REAL
// PostgreSQL server -- many separate connections at once, which PGlite (one
// connection) cannot do.
//
// Throwaway and isolated (scripts/lib/localPostgres.mjs): a new cluster in a
// temp folder on a private Unix socket, every gameplay migration, the races,
// then the server is stopped and the folder deleted. It never connects to
// Supabase and reads no .env.
//
//   node scripts/concurrency-check.mjs            (needs Homebrew postgresql@17)
//   PG_BIN=/path/to/postgres/bin node scripts/concurrency-check.mjs

import process from "node:process";
import { randomUUID } from "node:crypto";
import { GAMEPLAY_MIGRATIONS, installSupabaseStandIns, startLocalPostgres } from "./lib/localPostgres.mjs";

let db;
const sql = (text) => db.sql(text);
const request = (text) => db.request(text);

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
  db = startLocalPostgres();
  console.log(`Postgres ${sql("show server_version")} running in ${db.dir} (socket only)\n`);
  installSupabaseStandIns(db);
  for (const m of GAMEPLAY_MIGRATIONS) db.file(m);
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
  failed = true;
  console.error(e.stderr?.toString() || e.message);
  if (db) console.error(db.log().slice(-2000));
} finally {
  db?.stop();
  console.log(`\nServer stopped; ${db?.dir} removed.`);
}
process.exit(failed ? 1 : 0);
