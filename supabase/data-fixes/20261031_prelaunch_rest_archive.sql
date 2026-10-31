-- Elements Baseball — archive the pre-launch persistent rest rows.
--
-- WHY: Elements Baseball is not live, and nothing played before launch may
-- count (Anthony, 2026-10-31). The only persistent progression gameplay has
-- ever written is player_rest_state: 72 rows, every one written by one of two
-- game completions (the 2026-08-28 verification game and the 2026-10-30
-- Anthony v Will game). The pregame screen reads this table, so until it is
-- cleared those rows still carry fatigue into new test games, and
-- activate_official_tracking() refuses to switch tracking on while any remain.
--
-- WHAT: copies every row, unchanged, into player_rest_state_prelaunch_archive
-- (with the game that wrote it, where it can be traced), then removes it from
-- player_rest_state. Nothing is lost; official rest starts from zero.
-- Completed-game counts for milestones need no change: since
-- 20261031_gameplay_one_active_game.sql they count only `official` games, and
-- every existing game is `prelaunch`. No other progression table exists.
--
-- SUPERSEDES supabase/data-fixes/20261030_first_live_game_rest_correction.sql,
-- which corrected rows this archives. Do not run that one.
--
-- HOW TO RUN (Supabase SQL Editor), after the Stage 3 migration:
--   STEP 1 alone first (read-only) and read the rows. Then STEP 2 alone.
--   STEP 2 refuses to run once official tracking is on, and is safe to run
--   twice (a second run finds nothing to move).
--
-- STATUS: written 2026-10-31; tested against a real Postgres by
-- src/gameplay/__tests__/prelaunchRestArchiveSql.test.ts. NOT run yet.

-- ===================== STEP 1: preview (read-only) =====================
select p.manager_name, r.season_id, r.card_key, r.hitter_games_remaining, r.pitcher_games_remaining, r.updated_at,
  (select g.id from public.games g where g.completed_at = r.updated_at limit 1) as written_by_game,
  (select g.progression from public.games g where g.completed_at = r.updated_at limit 1) as that_game_is
from public.player_rest_state r
left join public.profiles p on p.user_id = r.user_id
order by p.manager_name, r.season_id, r.card_key;

-- ===================== STEP 2: apply =====================
begin;

do $$
begin
  if public.gameplay_official_tracking_enabled() then
    raise exception 'Official tracking is on: rest rows may now be official. This archive is for pre-launch rows only.';
  end if;
end;
$$;

create table if not exists public.player_rest_state_prelaunch_archive (
  user_id uuid not null references auth.users(id) on delete cascade,
  season_id text not null,
  card_key text not null,
  hitter_games_remaining integer not null,
  pitcher_games_remaining integer not null,
  updated_at timestamptz not null,
  source_game_id uuid references public.games(id) on delete set null,
  archived_at timestamptz not null default now(),
  primary key (user_id, season_id, card_key)
);
alter table public.player_rest_state_prelaunch_archive enable row level security;
drop policy if exists "Managers can view their own archived pre-launch rest" on public.player_rest_state_prelaunch_archive;
create policy "Managers can view their own archived pre-launch rest"
on public.player_rest_state_prelaunch_archive for select to authenticated
using (user_id = (select auth.uid()));
comment on table public.player_rest_state_prelaunch_archive is
  'Persistent rest written by pre-launch games, kept for reference. Never read by gameplay; official rest lives in player_rest_state.';

insert into public.player_rest_state_prelaunch_archive
  (user_id, season_id, card_key, hitter_games_remaining, pitcher_games_remaining, updated_at, source_game_id)
select r.user_id, r.season_id, r.card_key, r.hitter_games_remaining, r.pitcher_games_remaining, r.updated_at,
  (select g.id from public.games g where g.completed_at = r.updated_at limit 1)
from public.player_rest_state r
on conflict (user_id, season_id, card_key) do nothing;

-- Remove only rows that are now in the archive exactly as they are here.
delete from public.player_rest_state r
using public.player_rest_state_prelaunch_archive a
where a.user_id = r.user_id and a.season_id = r.season_id and a.card_key = r.card_key
  and a.hitter_games_remaining = r.hitter_games_remaining
  and a.pitcher_games_remaining = r.pitcher_games_remaining
  and a.updated_at = r.updated_at;

commit;
