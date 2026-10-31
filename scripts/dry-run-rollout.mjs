// Rehearses the Stage 3 rollout on a COPY of the live gameplay data, on a
// throwaway local Postgres (scripts/lib/localPostgres.mjs). Never touches
// Supabase: it reads a snapshot taken by `npm run snapshot:gameplay`.
//
//   node scripts/dry-run-rollout.mjs [backups/gameplay-<time>]   (default: newest)
//
// In order, exactly as supabase/ROLLOUT_STAGE3.md: the live schema (every
// migration before Stage 3), the snapshot's rows, the read-only preview, the
// migration, the post-migration verification queries, the pre-launch rest
// archive (all five steps), a rollback and re-apply, and finally launch
// activation -- here only, to prove the clean slate is accepted.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { GAMEPLAY_MIGRATIONS, installSupabaseStandIns, startLocalPostgres } from "./lib/localPostgres.mjs";

const root = path.join(import.meta.dirname, "..");
const backups = path.join(root, "backups");
const snapshot = process.argv[2] ? path.resolve(process.argv[2])
  : path.join(backups, fs.readdirSync(backups).filter((d) => d.startsWith("gameplay-")).sort().at(-1));
const rows = (t) => JSON.parse(fs.readFileSync(path.join(snapshot, `${t}.json`), "utf8"));
const migration = GAMEPLAY_MIGRATIONS.at(-1);
const previewFile = path.join(root, "supabase/data-fixes/20261031_one_active_game_preview.sql");
const archiveSql = fs.readFileSync(path.join(root, "supabase/data-fixes/20261031_prelaunch_rest_archive.sql"), "utf8");
const archiveSteps = archiveSql.split(/-- ===================== STEP \d: [^\n]*=====================/).slice(1);

let failed = false;
const check = (label, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); if (!ok) failed = true; };
let db;

try {
  console.log(`Snapshot: ${snapshot}`);
  db = startLocalPostgres("54330");
  installSupabaseStandIns(db);
  for (const m of GAMEPLAY_MIGRATIONS.slice(0, -1)) db.file(m);

  // Load the snapshot through files, as superuser (no RLS), keeping identity values.
  const games = rows("games"), events = rows("game_events"), rolls = rows("game_rolls"), rest = rows("player_rest_state");
  const access = rows("gameplay_feature_access"), profiles = rows("profiles");
  const users = new Set([...profiles.map((p) => p.user_id), ...games.flatMap((g) => [g.home_user_id, g.away_user_id, g.paused_by_user_id]),
    ...access.map((a) => a.user_id), ...rest.map((r) => r.user_id), ...events.map((e) => e.actor_user_id)].filter(Boolean));
  const load = (table, data, extra = "") => {
    const f = path.join(db.dir, `${table}.json`);
    fs.writeFileSync(f, JSON.stringify(data));
    const script = path.join(db.dir, `${table}.sql`);
    fs.writeFileSync(script, `\\set content \`cat ${f}\`\ninsert into ${table} ${extra} select * from jsonb_populate_recordset(null::${table}, :'content'::jsonb);\n`);
    db.file(script);
  };
  load("auth.users", [...users].map((id) => ({ id })));
  load("public.profiles", profiles.map(({ user_id, manager_name, avatar_url }) => ({ user_id, manager_name, avatar_url })));
  load("public.gameplay_feature_access", access);
  load("public.games", games);
  load("public.game_events", events, "overriding system value");
  // Loading kept the original ids; move the id counter past them, as it is live.
  db.sql("select setval(pg_get_serial_sequence('public.game_events', 'id'), (select max(id) from public.game_events))");
  load("public.game_rolls", rolls);
  load("public.player_rest_state", rest);
  console.log(`Loaded: ${games.length} games, ${events.length} events, ${rolls.length} rolls, ${rest.length} rest rows, ${access.length} access rows, ${profiles.length} profiles\n`);

  // 1. The read-only preview.
  // Its two SELECTs, each read back as JSON.
  const [previewList, previewConflicts] = fs.readFileSync(previewFile, "utf8").replace(/^--.*$/gm, "")
    .split(";").map((x) => x.trim()).filter(Boolean)
    .map((stmt) => JSON.parse(db.sql(`select coalesce(json_agg(t), '[]') from (${stmt}) t`)));
  const close = previewList.filter((r) => r.action === "CLOSE");
  check("preview: exactly 14 games to CLOSE and nothing else unfinished", close.length === 14 && previewList.length === 14,
    previewList.map((r) => `${r.action} ${r.id.slice(0, 8)} ${r.status} ${r.home} v ${r.away}`).join(" | "));
  check("preview: no managers left in two unfinished two-player games", previewConflicts.length === 0, previewConflicts);

  // 2. The migration, one transaction.
  const before = { events: Number(db.sql("select count(*) from public.game_events")), complete: db.sql("select string_agg(id::text || ':' || coalesce(completed_at::text,'-'), ',' order by id) from public.games where status = 'complete'") };
  db.file(migration);
  check("migration applied", true);

  // 3. The runbook's verification queries.
  const q = (s) => db.sql(s);
  check("official tracking is off", q("select official_tracking_enabled from public.gameplay_settings") === "f");
  check("statuses: 7 complete, 14 terminated", q("select string_agg(status || ' ' || n, ', ' order by status) from (select status, count(*) n from public.games group by 1) s") === "complete 7, terminated 14",
    q("select string_agg(status || ' ' || n, ', ' order by status) from (select status, count(*) n from public.games group by 1) s"));
  check("14 closed as practice_cleanup, none completed by it", q("select count(*) from public.games where end_reason = 'practice_cleanup' and completed_at is null") === "14");
  check("every game is pre-launch", q("select string_agg(progression || ' ' || n, ', ') from (select progression, count(*) n from public.games group by 1) s") === "prelaunch 21");
  check("no active games registered", q("select count(*) from public.gameplay_active_games") === "0");
  check("app roles cannot activate, suspend or resume tracking",
    q(`select bool_or(has_function_privilege(r, f, 'execute')) from unnest(array['authenticated','anon','service_role']) r,
       unnest(array['public.activate_official_tracking(text)','public.suspend_official_tracking(text)','public.resume_official_tracking(text)']) f`) === "f");
  check("permissions: Anthony test+terminate, Will test only",
    q("select string_agg(p.manager_name || ' ' || a.can_create_test_games || '/' || a.can_terminate_games, ', ' order by p.manager_name) from public.gameplay_feature_access a join public.profiles p using (user_id)") === "Anthony true/true, Will true/false",
    q("select string_agg(p.manager_name || ' ' || a.can_create_test_games || '/' || a.can_terminate_games, ', ' order by p.manager_name) from public.gameplay_feature_access a join public.profiles p using (user_id)"));
  check("history kept: every old event still there, plus 14 closing events",
    Number(q("select count(*) from public.game_events")) === before.events + 14 && q("select count(*) from public.game_events where event_type = 'GAME_TERMINATED'") === "14");
  check("completed games untouched", q("select string_agg(id::text || ':' || coalesce(completed_at::text,'-'), ',' order by id) from public.games where status = 'complete'") === before.complete);
  check("rest rows untouched by the migration", q("select count(*) from public.player_rest_state") === String(rest.length));

  // 4. The pre-launch rest archive, step by step.
  const step = (i) => { const f = path.join(db.dir, `archive-${i}.sql`); fs.writeFileSync(f, archiveSteps[i]); return db.file(f).trim().split("\n").at(-1); };
  step(0);
  step(1);
  const verify = step(2).split("|");
  check("archive STEP 3: every live row has an identical archived copy", verify[0] === verify[1] && verify[2] === "0", { live: verify[0], archived: verify[1], missing: verify[2], tracedToAGame: verify[3] });
  step(3);
  const afterArchive = step(4).split("|");
  check("archive STEP 5: live rest empty, all rows archived, from the two source games", afterArchive[0] === "0" && afterArchive[1] === String(rest.length), { live: afterArchive[0], archived: afterArchive[1], sourceGames: afterArchive[2] });

  // 5. Rollback rehearsal: back to the old app's behaviour, protections kept, then forward again.
  db.file(path.join(root, "supabase/rollbacks/20261031_gameplay_one_active_game_rollback.sql"));
  check("rollback: the old app's insert policy is back and the one-game triggers are gone",
    q("select count(*) from pg_policies where tablename = 'games' and policyname = 'Gameplay lab testers can create private test games'") === "1"
    && q("select count(*) from pg_trigger where tgname in ('gameplay_games_guard','gameplay_sync_active_games')") === "0");
  check("rollback: the pre-launch rest guard is kept, and the restored writer only writes rest while tracking is on",
    q("select count(*) from pg_trigger where tgname = 'gameplay_rest_write_guard'") === "1"
    && q("select prosrc like '%public.gameplay_official_tracking_enabled()%' from pg_proc where proname = 'save_gameplay_lab_state'") === "t"
    && q("select official_tracking_enabled from public.gameplay_settings") === "f");
  check("rollback: closed games stay closed, history intact",
    q("select count(*) from public.games where status = 'terminated'") === "14" && Number(q("select count(*) from public.game_events")) === before.events + 14);
  db.file(migration);
  check("re-applying the migration after the rollback succeeds", q("select count(*) from pg_trigger where tgname in ('gameplay_games_guard','gameplay_sync_active_games','gameplay_rest_write_guard')") === "3");

  // 6. Launch day (in this throwaway copy only): the clean slate is accepted.
  q("select public.activate_official_tracking('Elements Baseball is officially live')");
  check("activation accepts the clean slate (rehearsal only)", q("select official_tracking_enabled from public.gameplay_settings") === "t");
} catch (e) {
  failed = true;
  console.error(e.stderr?.toString() || e.message);
  if (db) console.error(db.log().slice(-1500));
} finally {
  db?.stop();
  console.log("\nLocal server stopped and its folder removed. Supabase was not contacted.");
}
process.exit(failed ? 1 : 0);
