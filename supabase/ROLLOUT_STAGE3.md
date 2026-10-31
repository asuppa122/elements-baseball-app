# Stage 3 rollout — one active game, nothing counts before launch

Nothing here has been run against production. Each step needs Anthony's
go-ahead. Deploying the site never turns official tracking on; only the launch
step does, and only when Anthony declares Elements Baseball live — after every
item in `LAUNCH_BLOCKERS.md` is done.

## A. Preflight (read-only; repeat on the day)

1. **Backups.** Confirm today's Supabase backup exists (Dashboard → Database →
   Backups). Then `npm run snapshot:gameplay` (writes `backups/gameplay-<time>/`,
   git-ignored: games, events, dice, rest, access, profiles).
2. **Inventory.** `npm run inventory:games` must say
   `on the migration's list: 14 of its 14  NOT on it: 0`. Anything not on the
   list: stop and decide about it first. `npm run inventory:progression`
   should still show 72 rest rows, all traced to a game completion.
3. **Rehearsal.** `npm run check:rollout` replays this whole runbook on a copy
   of that snapshot on a throwaway local Postgres (never Supabase), including
   a rollback and re-apply. All 20 checks must pass.
4. **Preview, live.** Run `supabase/data-fixes/20261031_one_active_game_preview.sql`
   in the SQL Editor: exactly 14 `CLOSE` rows, nothing else, and no rows from
   the second query.
5. **Quiet moment.** Nobody (Will included) mid-move: the old app cannot create
   games once B6 runs, and the new app cannot load until B7.

## B. Migration and deploy

6. **Migration.** Run all of `supabase/migrations/20261031_gameplay_one_active_game.sql`
   in the SQL Editor. One transaction: if it fails, nothing changed.
7. **Deploy** the app straight after (push `main` → Vercel). Order matters:

   | | old database | new database |
   |---|---|---|
   | old app | works | cannot create games or pause; everything else works |
   | new app | games page fails to load | works |

8. **Verify** (SQL Editor, read-only):

   ```sql
   select official_tracking_enabled, official_tracking_started_at from public.gameplay_settings; -- false, null
   select status, count(*) from public.games group by 1 order by 1;            -- complete 7, terminated 14
   select count(*) from public.games where end_reason = 'practice_cleanup';    -- 14
   select progression, count(*) from public.games group by 1;                  -- prelaunch 21
   select count(*) from public.gameplay_active_games;                          -- 0
   select bool_or(has_function_privilege(r, f, 'execute'))
   from unnest(array['authenticated','anon','service_role']) r,
        unnest(array['public.activate_official_tracking(text)','public.suspend_official_tracking(text)',
                     'public.resume_official_tracking(text)']) f;              -- false
   select p.manager_name, a.can_create_test_games, a.can_terminate_games
   from public.gameplay_feature_access a join public.profiles p using (user_id); -- Anthony t/t, Will t/f
   ```

## C. Pre-launch rest archive (approved 2026-10-31)

Run `supabase/data-fixes/20261031_prelaunch_rest_archive.sql` one step at a
time in the SQL Editor:

9.  **STEP 1** (read-only): 72 rows, each with the game that wrote it.
10. **STEP 2**: copies them into `player_rest_state_prelaunch_archive`. Removes nothing.
11. **STEP 3** (read-only): `live_rows = archived_rows = 72`,
    `rows_missing_from_archive = 0`, `archived_rows_traced_to_a_game = 72`.
    Anything else: stop.
12. **STEP 4**: removes the archived rows from `player_rest_state`; it re-checks
    STEP 3 itself and refuses, removing nothing, if any row lacks an identical copy.
13. **STEP 5** (read-only): `live_rows = 0`, `archived_rows = 72`, `source_games = 2`.

Do **not** run `20261030_first_live_game_rest_correction.sql` (superseded).

## D. Two-account test (required; pre-launch, so nothing counts)

14. Anthony and Will on the deployed site: the games page shows the pre-launch
    notice; create a two-player game; neither can start another (official or
    friendly); cancel it before the first pitch — both free; create another,
    pregame on both sides, alternate turns, make decisions, leave mid-game and
    resume, play to the end. Then:

    ```sql
    select progression, status from public.games order by created_at desc limit 2;  -- prelaunch
    select count(*) from public.player_rest_state;                                    -- 0
    ```

## E. Launch day (only when Anthony declares it, after LAUNCH_BLOCKERS.md)

15. ```sql
    select public.activate_official_tracking('Elements Baseball is officially live');
    ```
    Refuses if any rest row remains (C not done). From then on two-player games
    are `official` (or `practice` if created as friendlies; both count toward
    the one-game limit), one-screen games `practice`. Every earlier game stays
    `prelaunch` for good.

**Emergency suspension:** `select public.suspend_official_tracking('<reason>');`
New games are `untracked`; official games play on but their final move is
refused (nothing saved) until `select public.resume_official_tracking('<reason>');`,
after which the same move finishes them and records their progression.

## F. If something goes wrong

- **Migration error:** nothing was applied (one transaction). Fix, re-run A.
- **Problem after applying:** prefer a forward fix. Otherwise run all of
  `supabase/rollbacks/20261031_gameplay_one_active_game_rollback.sql` (one
  transaction) and redeploy the previous app version. It restores the old
  app's behaviour but **keeps the pre-launch rule**: its writer records rest
  only while official tracking is on (it is off), and the
  `gameplay_rest_write_guard` trigger stays, so even the original 20261030
  writer re-run by mistake has its rest write refused (the completing save
  fails; nothing is recorded). **Do not re-run 20261030 after a rollback.**
  The 14 closed games stay closed; the migration can be re-applied later
  (rehearsed by `npm run check:rollout`).
- **Archive problem:** STEPs 2–4 are idempotent; STEP 4 never removes a row
  without an identical archived copy. The archive table itself is the backup
  of those rows; the snapshot from A1 is a second copy.
- **Data damaged:** restore the affected rows from the A1 snapshot or the
  Supabase backup.
