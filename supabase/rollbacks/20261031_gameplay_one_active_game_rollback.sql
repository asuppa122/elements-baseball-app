-- Elements Baseball — ROLLBACK for 20261031_gameplay_one_active_game.sql.
-- Only if a problem is found after the migration and a forward fix is not
-- quicker. Run in the Supabase SQL Editor; one transaction.
--
-- Restores the previous behaviour: the browser may insert games again (the
-- old app's create path), the writer is the 20261030 one (accepts the old
-- events, writes rest on every completion as before), and the one-game limit,
-- cancellation and ending functions are gone.
--
-- Deliberately KEPT, because removing them would lose information and the old
-- code ignores them: the new columns (play_mode, progression, ended_*, end_*),
-- the 14 closed practice games (they stay `terminated`, which the old status
-- check would reject -- so the old status list is extended, not restored), and
-- the settings/history tables. Re-running the migration later is safe.
--
-- Deploy the previous app version together with this, or the new app's games
-- page will fail to load. Note the restored writer writes persistent rest on
-- every completion again (the old behaviour) until the migration is re-applied.
--
-- STATUS: written 2026-10-31; tested by oneActiveGameSql.test.ts
-- (apply, roll back, the old flows work again). NOT run.

begin;

drop trigger if exists gameplay_sync_active_games on public.games;
drop trigger if exists gameplay_games_guard on public.games;
drop table if exists public.gameplay_active_games;

drop function if exists public.gameplay_sync_active_games();
drop function if exists public.gameplay_games_guard();
drop function if exists public.create_gameplay_game(jsonb, boolean);
drop function if exists public.cancel_gameplay_game(uuid);
drop function if exists public.terminate_gameplay_game(uuid, text);
drop function if exists public.get_my_active_game();
drop function if exists public.get_my_gameplay_permissions();
drop function if exists public.gameplay_has_begun(public.games);

-- The old insert policy (20260818_gameplay_phase1a_private_lab.sql).
drop policy if exists "Gameplay lab testers can create private test games" on public.games;
create policy "Gameplay lab testers can create private test games"
on public.games for insert
to authenticated
with check (
  public.has_gameplay_lab_access()
  and home_user_id = (select auth.uid())
  and home_user_id <> away_user_id
);

-- The old app does not write these columns. Left null for games it creates;
-- re-running the migration fills them in from each game (and, with tracking
-- off, as prelaunch).
alter table public.games alter column play_mode drop not null;
alter table public.games alter column progression drop not null;

commit;

-- Then, separately: re-run the 20261030 writer to restore it exactly --
-- the whole of supabase/migrations/20261030_gameplay_rest_appearance_fix.sql
-- (it is a single `create or replace function`, safe to run again).
