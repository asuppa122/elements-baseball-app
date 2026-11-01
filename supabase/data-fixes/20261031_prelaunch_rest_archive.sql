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
-- HOW TO RUN (Supabase SQL Editor), after the Stage 3 migration, each step
-- ALONE and in order, reading each result before the next:
--   STEP 1  preview (read-only): every row, and the game that wrote it.
--   STEP 2  copy into the archive. Removes nothing.
--   STEP 3  verify the copy (read-only): must say rows_missing_from_archive = 0
--           and live_rows = archived_rows.
--   STEP 4  remove the archived rows from player_rest_state. Re-checks STEP 3
--           itself and refuses if any live row lacks an identical archived copy.
--   STEP 5  verify after (read-only): live_rows = 0, archived_rows = 72.
--   STEPs 2 and 4 refuse once Elements Baseball has launched, and are safe to re-run.
--
-- STATUS: written 2026-10-31; tested against a real Postgres by
-- src/gameplay/__tests__/prelaunchRestArchiveSql.test.ts. RUN on the live
-- project 2026-10-31, step by step: STEP 3 = 72/72/0 missing/72 traced; STEP 5
-- = 0 live / 72 archived / 2 source games; archived values match the pre-change
-- snapshot exactly.

-- ===================== STEP 1: preview (read-only) =====================
select p.manager_name, r.season_id, r.card_key, r.hitter_games_remaining, r.pitcher_games_remaining, r.updated_at,
  (select g.id from public.games g where g.completed_at = r.updated_at limit 1) as written_by_game,
  (select g.progression from public.games g where g.completed_at = r.updated_at limit 1) as that_game_is
from public.player_rest_state r
left join public.profiles p on p.user_id = r.user_id
order by p.manager_name, r.season_id, r.card_key;

-- ===================== STEP 2: copy into the archive =====================
begin;

do $$
begin
  if public.gameplay_official_tracking_started() then
    raise exception 'Elements Baseball has launched: rest rows may now be official. This archive is for pre-launch rows only.';
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
  'Persistent rest written by pre-launch games, kept for reference with the game that wrote each row. Never read by gameplay; official rest lives in player_rest_state.';

insert into public.player_rest_state_prelaunch_archive
  (user_id, season_id, card_key, hitter_games_remaining, pitcher_games_remaining, updated_at, source_game_id)
select r.user_id, r.season_id, r.card_key, r.hitter_games_remaining, r.pitcher_games_remaining, r.updated_at,
  (select g.id from public.games g where g.completed_at = r.updated_at limit 1)
from public.player_rest_state r
on conflict (user_id, season_id, card_key) do nothing;

commit;

-- ===================== STEP 3: verify the copy (read-only) =====================
select
  (select count(*) from public.player_rest_state) as live_rows,
  (select count(*) from public.player_rest_state_prelaunch_archive) as archived_rows,
  (select count(*) from public.player_rest_state r
    where not exists (
      select 1 from public.player_rest_state_prelaunch_archive a
      where a.user_id = r.user_id and a.season_id = r.season_id and a.card_key = r.card_key
        and a.hitter_games_remaining = r.hitter_games_remaining
        and a.pitcher_games_remaining = r.pitcher_games_remaining
        and a.updated_at = r.updated_at)) as rows_missing_from_archive,
  (select count(*) from public.player_rest_state_prelaunch_archive where source_game_id is not null) as archived_rows_traced_to_a_game;

-- ===================== STEP 4: remove the archived rows =====================
begin;

do $$
declare v_missing bigint;
begin
  if public.gameplay_official_tracking_started() then
    raise exception 'Elements Baseball has launched: rest rows may now be official. This archive is for pre-launch rows only.';
  end if;
  select count(*) into v_missing from public.player_rest_state r
  where not exists (
    select 1 from public.player_rest_state_prelaunch_archive a
    where a.user_id = r.user_id and a.season_id = r.season_id and a.card_key = r.card_key
      and a.hitter_games_remaining = r.hitter_games_remaining
      and a.pitcher_games_remaining = r.pitcher_games_remaining
      and a.updated_at = r.updated_at);
  if v_missing > 0 then
    raise exception '% live rest row(s) have no identical archived copy. Run STEP 2 again and re-check STEP 3; nothing was removed.', v_missing;
  end if;
end;
$$;

-- Remove only rows that are in the archive exactly as they are here.
delete from public.player_rest_state r
using public.player_rest_state_prelaunch_archive a
where a.user_id = r.user_id and a.season_id = r.season_id and a.card_key = r.card_key
  and a.hitter_games_remaining = r.hitter_games_remaining
  and a.pitcher_games_remaining = r.pitcher_games_remaining
  and a.updated_at = r.updated_at;

commit;

-- ===================== STEP 5: verify after (read-only) =====================
select
  (select count(*) from public.player_rest_state) as live_rows,
  (select count(*) from public.player_rest_state_prelaunch_archive) as archived_rows,
  (select count(distinct source_game_id) from public.player_rest_state_prelaunch_archive) as source_games;
