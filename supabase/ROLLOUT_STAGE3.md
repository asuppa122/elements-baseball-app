# Stage 3 rollout — one active game, pre-launch tracking off

Nothing here has been run against production. Each step needs Anthony's go-ahead.
Deploying the site never turns official tracking on; only step 9 does, and only
when Anthony declares Elements Baseball live.

## Before (read-only)

1. **Backups.** Confirm today's Supabase backup exists (Dashboard → Database →
   Backups), then take a local snapshot: `npm run snapshot:gameplay`
   (writes `backups/gameplay-<time>/`, git-ignored).
2. **Inventory.** `npm run inventory:games` — expect the same 14 unfinished
   games as the migration's list and no others. A new game since the
   inventory: stop and decide about it first.
3. **Preview.** Run `supabase/data-fixes/20261031_one_active_game_preview.sql`
   in the SQL Editor. Expect exactly 14 `CLOSE` rows, nothing else, and no rows
   from the second query.
4. **Quiet moment.** Nobody (Will included) mid-move: the old app cannot create
   games once step 5 runs, and the new one cannot load until step 6.

## Apply

5. **Migration.** Run all of `supabase/migrations/20261031_gameplay_one_active_game.sql`
   in the SQL Editor. It is one transaction: if it fails, nothing changed.
6. **Deploy** the app straight after (push to `main` → Vercel). Order matters:

   | | old database | new database |
   |---|---|---|
   | old app | works | cannot create games or pause; everything else works |
   | new app | games page fails to load | works |

## Verify (read-only SQL, then the app)

7. In the SQL Editor:

   ```sql
   select official_tracking_enabled from public.gameplay_settings;            -- false
   select status, count(*) from public.games group by 1 order by 1;            -- complete 7, terminated 14
   select count(*) from public.games where end_reason = 'practice_cleanup';    -- 14
   select progression, count(*) from public.games group by 1;                  -- prelaunch 21
   select count(*) from public.gameplay_active_games;                          -- 0
   select has_function_privilege('authenticated', 'public.activate_official_tracking(text)', 'execute'); -- false
   select p.manager_name, a.can_create_test_games, a.can_terminate_games
   from public.gameplay_feature_access a join public.profiles p using (user_id); -- Anthony t/t, Will t/f
   ```

8. In the app, from both accounts (these are pre-launch games: nothing counts):
   the games page shows the pre-launch notice; create a two-player game;
   neither manager can start another; cancel it before the first pitch and
   both are free; create another and play it to the end from both screens;
   resume after leaving mid-game; then confirm
   `select count(*) from public.player_rest_state where updated_at > '<deploy time>'` is 0.

## Pre-launch clean slate (separate approval)

- Run `supabase/data-fixes/20261031_prelaunch_rest_archive.sql` STEP 1, read
  it, then STEP 2: the 72 pre-launch rest rows move to
  `player_rest_state_prelaunch_archive`. Do **not** run
  `20261030_first_live_game_rest_correction.sql` (superseded).

## Launch day (only when Anthony declares it)

9. In the SQL Editor, as the project owner:

   ```sql
   select public.activate_official_tracking('Elements Baseball is officially live');
   ```

   It refuses if any pre-launch rest row remains. Games created from then on
   are official (two-player) or practice (one-screen, or friendlies); every
   earlier game stays pre-launch for good. Emergency stop:
   `select public.suspend_official_tracking('<reason>');`

## If something goes wrong

- **Migration error:** nothing was applied (one transaction). Fix and re-run.
- **Problem after applying:** prefer a forward fix. Otherwise run
  `supabase/rollbacks/20261031_gameplay_one_active_game_rollback.sql`, then the
  whole of `20261030_gameplay_rest_appearance_fix.sql`, and redeploy the
  previous app version. The 14 closed games stay closed; the migration can be
  re-applied later. (The restored writer writes rest on every completion
  again until it is.)
- **Data damaged:** restore the affected rows from the local snapshot or the
  Supabase backup.
