-- Elements Baseball — Stage 3: one active game per manager, and nothing counts
-- until the league is declared live.
-- Run once in the Supabase SQL Editor, after 20261030_gameplay_rest_appearance_fix.sql.
-- Preview first: supabase/data-fixes/20261031_one_active_game_preview.sql (read-only).
--
-- STATUS: written 2026-10-31. Tested against PGlite by oneActiveGameSql.test.ts
-- and twoPlayerSql.test.ts, and against a real Postgres 17 server with two
-- connections by scripts/concurrency-check.mjs. NOT applied to the live project.
--
-- Two separate ideas, kept separate on purpose:
--
--   PLAY MODE (games.play_mode) -- how a game is played.
--     two_player: two managers, two screens. Counts toward the one-unfinished-
--                 game limit, before launch and after.
--     one_screen: one manager plays both teams (a development/test tool).
--                 Never counts toward the limit.
--
--   PROGRESSION (games.progression) -- whether a game feeds official records.
--     prelaunch: created while official tracking is OFF. Every game today.
--     practice:  created after launch but not official (one-screen games, or
--                a two-player game created as a friendly).
--     official:  created after launch as a competitive two-player game.
--     untracked: created after launch while official tracking is suspended.
--   Only `official` games write persistent rest or count toward milestones.
--   It is fixed when the game is created and never changes, so a game started
--   before launch never counts, however late it finishes.
--
--   DURING A SUSPENSION an official game keeps playing but cannot finish: the
--   writer refuses the move that would complete it, the game stays exactly as
--   it was, and the same move finishes it (and records its progression) once
--   tracking resumes. Untracked, practice and pre-launch games finish normally.
--
--   OFFICIAL TRACKING (gameplay_settings) -- a single switch, OFF by default.
--   Only the database owner can turn it on (activate_official_tracking, run in
--   the SQL Editor with a typed confirmation); no app, deploy, migration or
--   date turns it on. Activation refuses while any pre-launch rest row is
--   still in player_rest_state, so official totals start from zero. After
--   launch the owner may suspend it and resume it (never re-activate).
--
-- What it does, in order (one transaction -- any failure leaves nothing changed):
--   1. End states `cancelled` and `terminated`: no result, no rest tracking.
--   2. play_mode and progression on every game; all existing games prelaunch.
--   3. The official-tracking switch, OFF.
--   4. Two separate permissions: create one-screen test games (Anthony, Will)
--      and end a game without a result (Anthony).
--   5. Closes the 14 inventoried practice games (`terminated`,
--      practice_cleanup) -- an explicit list; later games are never swept up.
--   6. The active-game registry: one row per manager (primary key user_id),
--      kept by triggers on `games`, so two unfinished two-player games for one
--      manager can never both commit, however the rows are written.
--   7. Game creation, cancellation and ending as server functions; the
--      browser can no longer insert games.
--   8. The writer: no new pauses, no saving an ended game, persistent rest
--      only for official games while tracking is on.
--
-- Active (for the limit) means: play_mode = 'two_player' and status is not
-- complete / cancelled / terminated -- setup, pregame, ready, in_progress,
-- awaiting_decision, inning_transition, legacy paused, and any status added
-- later until it is deliberately listed as an end state (fail closed).

begin;

-- 1) End states ---------------------------------------------------------------
alter table public.games drop constraint if exists games_status_check;
alter table public.games add constraint games_status_check
  check (status in ('setup','pregame','ready','in_progress','awaiting_decision','inning_transition','paused','complete','cancelled','terminated'));

alter table public.games add column if not exists ended_at timestamptz;
alter table public.games add column if not exists ended_by_user_id uuid references auth.users(id) on delete set null;
alter table public.games add column if not exists end_reason text;
alter table public.games add column if not exists end_note text;
alter table public.games drop constraint if exists games_end_reason_check;
alter table public.games add constraint games_end_reason_check
  check (end_reason is null or end_reason in ('cancelled_before_first_pitch','admin_terminated','practice_cleanup'));

create or replace function public.gameplay_is_ended(p_status text)
returns boolean
language sql
immutable
as $$ select p_status in ('complete','cancelled','terminated') $$;

-- 2) Play mode and progression ---------------------------------------------------
alter table public.games add column if not exists play_mode text;
update public.games
set play_mode = case when coalesce((game_state->>'turnHandshake')::boolean, false) then 'two_player' else 'one_screen' end
where play_mode is null;
alter table public.games alter column play_mode set not null;
alter table public.games drop constraint if exists games_play_mode_check;
alter table public.games add constraint games_play_mode_check check (play_mode in ('two_player','one_screen'));

-- Every game that exists today was played before launch.
alter table public.games add column if not exists progression text;
update public.games set progression = 'prelaunch' where progression is null;
alter table public.games alter column progression set not null;
alter table public.games drop constraint if exists games_progression_check;
alter table public.games add constraint games_progression_check check (progression in ('prelaunch','practice','official','untracked'));

-- 3) The official-tracking switch ---------------------------------------------------
create table if not exists public.gameplay_settings (
  id boolean primary key default true check (id),
  official_tracking_enabled boolean not null default false,
  official_tracking_started_at timestamptz,
  updated_at timestamptz not null default now(),
  note text
);
insert into public.gameplay_settings (id) values (true) on conflict (id) do nothing;
alter table public.gameplay_settings enable row level security;
drop policy if exists "Anyone signed in can read the gameplay settings" on public.gameplay_settings;
create policy "Anyone signed in can read the gameplay settings"
on public.gameplay_settings for select to authenticated using (true);
-- No write policy: only the owner functions below change it.

create table if not exists public.gameplay_settings_history (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  official_tracking_enabled boolean not null,
  note text not null
);
alter table public.gameplay_settings_history enable row level security;

create or replace function public.gameplay_official_tracking_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce((select official_tracking_enabled from public.gameplay_settings where id), false) $$;
grant execute on function public.gameplay_official_tracking_enabled() to authenticated;

-- Run by Anthony in the SQL Editor, and only there: execute is revoked from
-- every app role, so no button, request or deploy can reach it.
create or replace function public.activate_official_tracking(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_rest bigint;
begin
  if p_confirmation is distinct from 'Elements Baseball is officially live' then
    raise exception 'To activate official tracking, pass exactly: Elements Baseball is officially live';
  end if;
  if public.gameplay_official_tracking_enabled() then
    raise exception 'Official tracking is already on (since %).', (select official_tracking_started_at from public.gameplay_settings where id);
  end if;
  if (select official_tracking_started_at from public.gameplay_settings where id) is not null then
    raise exception 'Elements Baseball already launched; official tracking is suspended. Use resume_official_tracking.';
  end if;
  -- A clean slate: no persistent rest may predate launch (archive it first:
  -- supabase/data-fixes/20261031_prelaunch_rest_archive.sql).
  select count(*) into v_rest from public.player_rest_state;
  if v_rest > 0 then
    raise exception 'player_rest_state still holds % pre-launch row(s). Archive them first; official totals must start from zero.', v_rest;
  end if;
  update public.gameplay_settings
  set official_tracking_enabled = true, official_tracking_started_at = now(), updated_at = now(), note = p_confirmation
  where id;
  insert into public.gameplay_settings_history (official_tracking_enabled, note) values (true, p_confirmation);
  return jsonb_build_object('official_tracking_enabled', true, 'started_at', now());
end;
$$;

-- The emergency stop, after launch only. Games already created keep their
-- classification; new games are `untracked`; official games cannot finish
-- until tracking resumes.
create or replace function public.suspend_official_tracking(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Give a reason.'; end if;
  if not public.gameplay_official_tracking_enabled() then
    raise exception 'Official tracking is not on, so there is nothing to suspend.';
  end if;
  update public.gameplay_settings set official_tracking_enabled = false, updated_at = now(), note = trim(p_reason) where id;
  insert into public.gameplay_settings_history (official_tracking_enabled, note) values (false, 'SUSPENDED: ' || trim(p_reason));
  return jsonb_build_object('official_tracking_enabled', false);
end;
$$;

-- Ends a suspension. Official games paused at their final move can finish.
create or replace function public.resume_official_tracking(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Give a reason.'; end if;
  if (select official_tracking_started_at from public.gameplay_settings where id) is null then
    raise exception 'Elements Baseball has not launched yet; use activate_official_tracking.';
  end if;
  if public.gameplay_official_tracking_enabled() then
    raise exception 'Official tracking is already on.';
  end if;
  update public.gameplay_settings set official_tracking_enabled = true, updated_at = now(), note = trim(p_reason) where id;
  insert into public.gameplay_settings_history (official_tracking_enabled, note) values (true, 'RESUMED: ' || trim(p_reason));
  return jsonb_build_object('official_tracking_enabled', true);
end;
$$;

-- Whether launch has happened, for the games page's notice.
create or replace function public.gameplay_official_tracking_started()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select (select official_tracking_started_at from public.gameplay_settings where id) is not null $$;
grant execute on function public.gameplay_official_tracking_started() to authenticated;

revoke all on function public.activate_official_tracking(text) from public;
revoke all on function public.suspend_official_tracking(text) from public;
revoke all on function public.resume_official_tracking(text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.activate_official_tracking(text) from %I', r);
      execute format('revoke all on function public.suspend_official_tracking(text) from %I', r);
      execute format('revoke all on function public.resume_official_tracking(text) from %I', r);
    end if;
  end loop;
end;
$$;

-- 4) Permissions -------------------------------------------------------------------
-- Two flags, not one: Will helps test (one-screen games) without being able
-- to end anyone's game. profiles.is_admin is not used -- it means something
-- else in the app and is not set for anyone. No client policy writes this table.
alter table public.gameplay_feature_access add column if not exists can_create_test_games boolean not null default false;
alter table public.gameplay_feature_access add column if not exists can_terminate_games boolean not null default false;
update public.gameplay_feature_access set can_create_test_games = true
where user_id in (select user_id from public.profiles where manager_name in ('Anthony', 'Will'));
update public.gameplay_feature_access set can_terminate_games = true
where user_id in (select user_id from public.profiles where manager_name = 'Anthony');

create or replace function public.gameplay_can_create_test_games()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.gameplay_feature_access a where a.user_id = auth.uid() and a.can_create_test_games
  );
$$;

create or replace function public.gameplay_can_terminate_games()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.gameplay_feature_access a where a.user_id = auth.uid() and a.can_terminate_games
  );
$$;

-- What the games page shows and enables: both permissions and whether
-- official tracking is on.
create or replace function public.get_my_gameplay_permissions()
returns table (can_create_test_games boolean, can_terminate_games boolean, official_tracking_enabled boolean, official_tracking_started boolean)
language sql
stable
security definer
set search_path = public
as $$
  select public.gameplay_can_create_test_games(), public.gameplay_can_terminate_games(),
    public.gameplay_official_tracking_enabled(), public.gameplay_official_tracking_started();
$$;
grant execute on function public.gameplay_can_create_test_games() to authenticated;
grant execute on function public.gameplay_can_terminate_games() to authenticated;
grant execute on function public.get_my_gameplay_permissions() to authenticated;

-- Invariants on every write to `games`, whoever makes it.
create or replace function public.gameplay_games_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- The play mode comes from the game, never from what the writer claims.
    new.play_mode := case when coalesce((new.game_state->>'turnHandshake')::boolean, false) then 'two_player' else 'one_screen' end;
    -- Progression is decided here and only here. A writer may ask for
    -- `practice` (a friendly) but can never make a game official: before
    -- launch every game is prelaunch, during a suspension untracked, and a
    -- one-screen game is never official.
    new.progression := case
      when not public.gameplay_official_tracking_enabled() and not public.gameplay_official_tracking_started() then 'prelaunch'
      when not public.gameplay_official_tracking_enabled() then 'untracked'
      when new.play_mode = 'one_screen' then 'practice'
      when new.progression = 'practice' then 'practice'
      else 'official'
    end;
    -- One-screen games are a testing tool: testers only (or the database
    -- owner -- migrations, the SQL Editor).
    if new.play_mode = 'one_screen' and auth.uid() is not null and not public.gameplay_can_create_test_games() then
      raise exception 'Only an approved tester can create a one-screen test game.';
    end if;
    return new;
  end if;

  if new.play_mode is distinct from old.play_mode
     or (new.game_state->'turnHandshake') is distinct from (old.game_state->'turnHandshake') then
    raise exception 'A game''s play mode cannot change.';
  end if;
  if new.progression is distinct from old.progression then
    raise exception 'A game''s progression (pre-launch, practice, official or untracked) is fixed when it is created.';
  end if;
  if new.home_user_id is distinct from old.home_user_id or new.away_user_id is distinct from old.away_user_id then
    raise exception 'A game''s managers cannot change.';
  end if;
  if public.gameplay_is_ended(old.status) and new.status is distinct from old.status then
    raise exception 'This game has ended and cannot be reopened.';
  end if;
  -- Pause was removed (Stage 2). A game already paused may be resumed; no
  -- game may newly become paused.
  if new.status = 'paused' and old.status is distinct from 'paused' then
    raise exception 'Games can no longer be paused.';
  end if;
  return new;
end;
$$;

drop trigger if exists gameplay_games_guard on public.games;
create trigger gameplay_games_guard
before insert or update on public.games
for each row execute function public.gameplay_games_guard();

-- 5) Practice cleanup ----------------------------------------------------------
-- All 14 unfinished games in the 2026-10-31 inventory, every one a practice
-- game of Anthony's (confirmed by Anthony 2026-10-31). Closed as `terminated`
-- with no result: no win, loss, forfeit or completion, so rest tracking never
-- runs for them. Their saved moves and events stay; a GAME_TERMINATED event
-- records why. Re-running changes nothing (an ended game is skipped).
with closed as (
  update public.games g
  set status = 'terminated',
      game_state = jsonb_set(g.game_state, '{status}', '"terminated"'),
      state_version = g.state_version + 1,
      end_reason = 'practice_cleanup',
      end_note = 'Pre-launch practice game closed by the Stage 3 migration. No result recorded.',
      ended_at = now(),
      updated_at = now()
  where g.id in (
    -- Anthony and Will
    'd7a84ae8-8702-485c-8b99-60503b6ca7d8',
    '9faac0a3-9a67-4b0e-9b40-b53028e99c5d',
    'a96cc687-4f0e-4d8e-b8b7-961a09e3499c',
    '7c0dd0a3-41f2-41a7-a07f-ce92c1a2057e',
    '6883c8ea-4ed3-4bd3-a597-c72da823f845',
    'adba4077-3b9e-445d-9a68-cafd54e71b70',
    '794058a4-806f-410e-8ad4-464e915c52f4',
    -- Anthony's August one-screen games (named opponents Jeremiah, Zeek, Ryan, Ben)
    'a3c8f3a2-a172-4102-8058-79063140623f',
    'bee9a8b1-beed-4352-b7c1-774ae2bce27d',
    '9edee9f1-b3f2-4157-bf36-df4544456d2f',
    'a906e567-a2c0-4048-8e3a-e5cedfb08d51',
    '6a1b94ed-40bf-45de-a2fb-31b30b214f4a',
    '1ed608fb-febb-4c4c-8129-c57751ae9708',
    '0c37ba41-42a4-41e8-9f12-605398d7d6ec'
  )
  and not public.gameplay_is_ended(g.status)
  returning g.id, g.state_version
)
insert into public.game_events (game_id, state_version, event_type, actor_user_id, payload)
select id, state_version, 'GAME_TERMINATED', null,
  jsonb_build_object('reason', 'practice_cleanup', 'note', 'Closed by the Stage 3 migration; no result recorded.')
from closed
on conflict (game_id, state_version, event_type) do nothing;

-- 6) The active-game registry ---------------------------------------------------
create table if not exists public.gameplay_active_games (
  user_id uuid primary key references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  side text not null check (side in ('home','away')),
  registered_at timestamptz not null default now()
);
create index if not exists gameplay_active_games_game_idx on public.gameplay_active_games(game_id);
alter table public.gameplay_active_games enable row level security;
drop policy if exists "Managers can see their own active game" on public.gameplay_active_games;
create policy "Managers can see their own active game"
on public.gameplay_active_games for select
to authenticated
using (user_id = (select auth.uid()));
-- No insert/update/delete policy: only the trigger below writes it.

comment on table public.gameplay_active_games is
  'One row per manager in an unfinished two-player game (primary key user_id = at most one). Independent of progression: pre-launch and practice two-player games count too. Maintained only by the gameplay_sync_active_games trigger on games.';

-- Fails if the existing data already breaks the rule, naming who and where,
-- rather than registering one game and silently skipping another.
do $$
declare v_conflicts text;
begin
  select string_agg(format('%s in %s', user_id, games), '; ') into v_conflicts
  from (
    select user_id, string_agg(id::text, ', ') as games
    from (
      select id, home_user_id as user_id from public.games where play_mode = 'two_player' and not public.gameplay_is_ended(status)
      union all
      select id, away_user_id from public.games where play_mode = 'two_player' and not public.gameplay_is_ended(status)
    ) p
    group by user_id
    having count(*) > 1
  ) c;
  if v_conflicts is not null then
    raise exception 'Cannot enforce one active game: these managers are in more than one unfinished two-player game: %', v_conflicts;
  end if;
end;
$$;

insert into public.gameplay_active_games (user_id, game_id, side)
select home_user_id, id, 'home' from public.games where play_mode = 'two_player' and not public.gameplay_is_ended(status)
union all
select away_user_id, id, 'away' from public.games where play_mode = 'two_player' and not public.gameplay_is_ended(status)
on conflict (user_id) do nothing;

-- Keeps the registry equal to "two-player and not ended", row by row, in the
-- same transaction as the write to `games`: if the write fails, so does the
-- registration, and nothing stale is left. A second game for a manager hits
-- the primary key; a concurrent one waits on it and then fails.
create or replace function public.gameplay_sync_active_games()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean := new.play_mode = 'two_player' and not public.gameplay_is_ended(new.status);
  v_side text;
  v_user uuid;
  v_other uuid;
begin
  if not v_active then
    delete from public.gameplay_active_games where game_id = new.id;
    return null;
  end if;

  for v_side, v_user in select * from (values ('home', new.home_user_id), ('away', new.away_user_id)) s(side, uid)
  loop
    perform 1 from public.gameplay_active_games where user_id = v_user and game_id = new.id;
    if found then continue; end if;
    begin
      insert into public.gameplay_active_games (user_id, game_id, side) values (v_user, new.id, v_side);
    exception when unique_violation then
      select game_id into v_other from public.gameplay_active_games where user_id = v_user;
      raise exception 'ACTIVE_GAME_%', upper(v_side)
        using hint = coalesce(v_other::text, ''),
              detail = format('Manager %s already has unfinished two-player game %s.', v_user, v_other);
    end;
  end loop;
  return null;
end;
$$;

drop trigger if exists gameplay_sync_active_games on public.games;
create trigger gameplay_sync_active_games
after insert or update of status, play_mode, home_user_id, away_user_id on public.games
for each row execute function public.gameplay_sync_active_games();

-- 7) Creating, cancelling and ending games --------------------------------------
-- The browser no longer inserts games; it calls create_gameplay_game.
drop policy if exists "Gameplay lab testers can create private test games" on public.games;
drop policy if exists "Game participants can create games" on public.games;

-- p_practice: ask for a friendly (never official). It cannot make a game
-- official; the guard trigger decides that.
create or replace function public.create_gameplay_game(p_state jsonb, p_practice boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_home uuid := nullif(p_state->'managers'->'home'->>'userId', '')::uuid;
  v_away uuid := nullif(p_state->'managers'->'away'->>'userId', '')::uuid;
  v_two_player boolean := coalesce((p_state->>'turnHandshake')::boolean, false);
  v_existing uuid;
  saved public.games%rowtype;
begin
  if not public.has_gameplay_lab_access() then
    raise exception 'Gameplay lab access is not enabled for this account.';
  end if;
  if v_home is distinct from auth.uid() then
    raise exception 'You can only create a game as its home manager.';
  end if;
  if v_away is null or v_away = v_home then
    raise exception 'Choose an opponent other than yourself.';
  end if;
  if not exists (select 1 from public.gameplay_feature_access where user_id = v_away) then
    raise exception 'That manager does not have gameplay access.';
  end if;
  if coalesce(p_state->>'status', '') not in ('setup','pregame') then
    raise exception 'A new game must start in pregame.';
  end if;
  if not v_two_player and not public.gameplay_can_create_test_games() then
    raise exception 'Only an approved tester can create a one-screen test game.';
  end if;

  -- Friendly answers for the common case; the registry's primary key is what
  -- actually guarantees it when two requests race.
  if v_two_player then
    select game_id into v_existing from public.gameplay_active_games where user_id = v_home;
    if found then raise exception 'ACTIVE_GAME_HOME' using hint = v_existing::text; end if;
    select game_id into v_existing from public.gameplay_active_games where user_id = v_away;
    if found then raise exception 'ACTIVE_GAME_AWAY' using hint = v_existing::text; end if;
  end if;

  insert into public.games (
    id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot,
    home_roster_snapshot, away_roster_snapshot, home_pregame, away_pregame, game_state, state_version, progression
  ) values (
    (p_state->>'gameId')::uuid, p_state->'configuration'->>'seasonId', (p_state->'configuration'->>'mlbYear')::int,
    p_state->>'status', v_home, v_away, p_state->'configuration',
    nullif(p_state->'pregame'->'home'->'roster', 'null'::jsonb), nullif(p_state->'pregame'->'away'->'roster', 'null'::jsonb),
    coalesce(p_state->'pregame'->'home', '{}'::jsonb), coalesce(p_state->'pregame'->'away', '{}'::jsonb),
    p_state, coalesce((p_state->>'stateVersion')::bigint, 1),
    case when p_practice then 'practice' end
  )
  returning * into saved;
  return to_jsonb(saved);
end;
$$;
drop function if exists public.create_gameplay_game(jsonb);
grant execute on function public.create_gameplay_game(jsonb, boolean) to authenticated;

-- The first pitch, from what the server itself recorded: the engine's
-- firstPitchThrown (set when the first plate appearance ends, a leadoff walk
-- included), any die the server issued, and any pitch, swing or decision roll
-- in the saved event log. Any one of them means the game has begun.
create or replace function public.gameplay_has_begun(p_game public.games)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((p_game.game_state->>'firstPitchThrown')::boolean, p_game.status not in ('setup','pregame','ready'))
    or exists (select 1 from public.game_rolls r where r.game_id = p_game.id)
    or exists (
      select 1 from public.game_events e
      where e.game_id = p_game.id
        and (e.event_type in ('PITCH_ROLLED','SWING_RESOLVED')
             or (e.event_type = 'DECISION_RESOLVED' and e.payload->>'resolutionKind' = 'ROLL'))
    );
$$;

create or replace function public.cancel_gameplay_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  saved public.games%rowtype;
begin
  if not public.has_gameplay_lab_access() then
    raise exception 'Gameplay lab access is not enabled for this account.';
  end if;
  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'Game not found.'; end if;
  -- Who may cancel is who may save it: either manager of a two-player game,
  -- the home tester of a one-screen game.
  if not (auth.uid() = g.home_user_id or (g.play_mode = 'two_player' and auth.uid() = g.away_user_id)) then
    raise exception 'You are not a manager in this game.';
  end if;
  if public.gameplay_is_ended(g.status) then
    raise exception 'This game has already ended.';
  end if;
  if public.gameplay_has_begun(g) then
    raise exception 'This game has already begun; it can only be cancelled before the first pitch.';
  end if;

  update public.games
  set status = 'cancelled',
      game_state = jsonb_set(game_state, '{status}', '"cancelled"'),
      state_version = state_version + 1,
      end_reason = 'cancelled_before_first_pitch',
      ended_at = now(),
      ended_by_user_id = auth.uid(),
      updated_at = now()
  where id = p_game_id
  returning * into saved;

  insert into public.game_events (game_id, state_version, event_type, actor_user_id, payload)
  values (p_game_id, saved.state_version, 'GAME_CANCELLED', auth.uid(), jsonb_build_object('reason', 'cancelled_before_first_pitch', 'from', g.status));
  return to_jsonb(saved);
end;
$$;
grant execute on function public.cancel_gameplay_game(uuid) to authenticated;

create or replace function public.terminate_gameplay_game(p_game_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  saved public.games%rowtype;
begin
  if not public.gameplay_can_terminate_games() then
    raise exception 'Only an authorized administrator can end a game without a result.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give a reason for ending the game.';
  end if;
  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'Game not found.'; end if;
  if public.gameplay_is_ended(g.status) then
    raise exception 'This game has already ended.';
  end if;

  update public.games
  set status = 'terminated',
      game_state = jsonb_set(game_state, '{status}', '"terminated"'),
      state_version = state_version + 1,
      end_reason = 'admin_terminated',
      end_note = trim(p_reason),
      ended_at = now(),
      ended_by_user_id = auth.uid(),
      updated_at = now()
  where id = p_game_id
  returning * into saved;

  insert into public.game_events (game_id, state_version, event_type, actor_user_id, payload)
  values (p_game_id, saved.state_version, 'GAME_TERMINATED', auth.uid(), jsonb_build_object('reason', 'admin_terminated', 'note', trim(p_reason), 'from', g.status));
  return to_jsonb(saved);
end;
$$;
grant execute on function public.terminate_gameplay_game(uuid, text) to authenticated;

-- The signed-in manager's active game, for the games page.
create or replace function public.get_my_active_game()
returns table (game_id uuid, status text, side text, opponent_name text)
language sql
stable
security definer
set search_path = public
as $$
  select a.game_id, g.status, a.side, p.manager_name
  from public.gameplay_active_games a
  join public.games g on g.id = a.game_id
  left join public.profiles p on p.user_id = case a.side when 'home' then g.away_user_id else g.home_user_id end
  where a.user_id = auth.uid();
$$;
grant execute on function public.get_my_active_game() to authenticated;

-- 8) The writer ------------------------------------------------------------------
-- 20261030_gameplay_rest_appearance_fix.sql's writer, verbatim except the
-- places marked [Stage 3].
create or replace function public.save_gameplay_lab_state(
  p_game_id uuid,
  p_expected_state_version bigint,
  p_next_state jsonb,
  p_event_type text,
  p_event_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_game public.games%rowtype;
  saved_game public.games%rowtype;
  next_version bigint;
  v_two_player boolean;
  v_caller text;
  v_other text;
  v_needed_kind text;
  v_issued record;
  v_side text;
  v_user_id uuid;
  v_roster jsonb;
  v_card_key text;
  v_hitter_appeared_keys jsonb;
  v_pitcher_appeared_keys jsonb;
  v_default_batter_keys jsonb;
  v_default_pitcher_keys jsonb;
  v_milestones jsonb;
  v_gm_completed_games bigint;
  v_milestone_bonus int;
  v_prior_hitter int;
  v_prior_pitcher int;
  v_hitter_fatigue int;
  v_pitcher_fatigue int;
  v_hitter_appeared boolean;
  v_pitcher_appeared boolean;
  v_new_hitter int;
  v_new_pitcher int;
  v_milestone jsonb;
begin
  if not public.has_gameplay_lab_access() then
    raise exception 'Gameplay lab access is not enabled for this account.';
  end if;

  select *
  into current_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found.';
  end if;

  -- [Stage 3] An ended game takes no more moves.
  if public.gameplay_is_ended(current_game.status) then
    raise exception 'This game has ended.';
  end if;

  v_two_player := coalesce((current_game.game_state->>'turnHandshake')::boolean, false);

  if v_two_player then
    v_caller := case auth.uid() when current_game.home_user_id then 'home' when current_game.away_user_id then 'away' else null end;
    if v_caller is null then
      raise exception 'You are not a manager in this game.';
    end if;
  elsif current_game.home_user_id <> auth.uid() then
    raise exception 'This private gameplay lab game does not belong to the authenticated tester.';
  end if;

  if current_game.state_version <> p_expected_state_version then
    raise exception 'Stale game state. Expected version %, current version is %.', p_expected_state_version, current_game.state_version;
  end if;

  if coalesce(p_next_state->>'gameId', '') <> p_game_id::text then
    raise exception 'Game state id does not match the target game.';
  end if;

  if not v_two_player
     and coalesce(p_next_state->'managers'->'home'->>'userId', '') <> auth.uid()::text then
    raise exception 'Game state home manager does not match the authenticated tester.';
  end if;

  next_version := coalesce((p_next_state->>'stateVersion')::bigint, 0);
  if next_version <> p_expected_state_version + 1 then
    raise exception 'Next state version must be exactly one greater than the saved state.';
  end if;

  -- [Stage 3] GAME_PAUSED is no longer accepted (Pause was removed);
  -- GAME_RESUMED stays so a legacy-paused game can be resumed.
  if p_event_type not in ('PREGAME_SUBMITTED', 'PREGAME_LOCKED', 'GAME_READY', 'GAME_STARTED', 'OFFENSE_READY', 'PITCH_ROLLED', 'SWING_RESOLVED', 'DECISION_RESOLVED', 'GAME_RESUMED') then
    raise exception 'Unsupported private gameplay lab event type: %', p_event_type;
  end if;

  -- [Stage 3] No new pauses; cancelling and ending go through their own
  -- functions, never a save.
  if p_next_state->>'status' = 'paused' and current_game.status <> 'paused' then
    raise exception 'Games can no longer be paused.';
  end if;
  -- [Stage 3] An official game cannot finish while official tracking is
  -- suspended: it would finish without its progression. Nothing is saved; the
  -- same move finishes it once tracking resumes.
  if p_next_state->>'status' = 'complete' and current_game.status <> 'complete'
     and current_game.progression = 'official' and not public.gameplay_official_tracking_enabled() then
    raise exception 'OFFICIAL_TRACKING_SUSPENDED'
      using detail = 'Official tracking is suspended. This official game can finish once it resumes; nothing has been lost.';
  end if;
  -- GAME_RESUMED is not turn-checked, so it is accepted only for what it is
  -- for: taking a legacy-paused game out of pause.
  if p_event_type = 'GAME_RESUMED' and current_game.status <> 'paused' then
    raise exception 'Only a paused game can be resumed.';
  end if;
  if p_next_state->>'status' in ('cancelled', 'terminated') then
    raise exception 'Use cancel_gameplay_game or terminate_gameplay_game to end a game without a result.';
  end if;

  if v_two_player then
    v_other := case v_caller when 'home' then 'away' else 'home' end;

    if p_next_state->'turnHandshake' is distinct from current_game.game_state->'turnHandshake'
       or p_next_state->'managers' is distinct from current_game.game_state->'managers' then
      raise exception 'A two-player game cannot change its managers or turn mode.';
    end if;

    if p_next_state->'pregame'->v_other is distinct from current_game.game_state->'pregame'->v_other
       or p_next_state->'restState'->v_other is distinct from current_game.game_state->'restState'->v_other then
      raise exception 'You cannot change the other manager''s team.';
    end if;

    if p_event_type in ('OFFENSE_READY', 'PITCH_ROLLED', 'SWING_RESOLVED', 'DECISION_RESOLVED')
       and public.gameplay_side_to_act(current_game.game_state) is distinct from v_caller then
      raise exception 'It is not your turn.';
    end if;

    v_needed_kind := case
      when p_event_type = 'PITCH_ROLLED' then 'pitch'
      when p_event_type = 'SWING_RESOLVED' then 'swing'
      when p_event_type = 'DECISION_RESOLVED' and p_event_payload->>'resolutionKind' = 'ROLL' then 'decision'
      else null
    end;

    select roll_kind, roll into v_issued
    from public.game_rolls
    where game_id = p_game_id and state_version = p_expected_state_version
    limit 1;

    if v_needed_kind is not null then
      if v_issued.roll_kind is distinct from v_needed_kind then
        raise exception 'This move needs a % roll from the server.', v_needed_kind;
      end if;
      if (p_event_payload->>'roll')::int is distinct from v_issued.roll then
        raise exception 'The roll does not match the one the server issued.';
      end if;
      if v_needed_kind = 'pitch'
         and (p_next_state->'plateAppearance'->>'pitchRoll')::int is distinct from v_issued.roll then
        raise exception 'The pitch was not resolved with the server''s roll.';
      end if;
    elsif v_issued.roll_kind is not null then
      raise exception 'A die has been rolled for this moment; that roll must be used.';
    end if;
  end if;

  update public.games
  set
    status = p_next_state->>'status',
    configuration_snapshot = p_next_state->'configuration',
    home_roster_snapshot = p_next_state->'pregame'->'home'->'roster',
    away_roster_snapshot = nullif(p_next_state->'pregame'->'away'->'roster', 'null'::jsonb),
    home_pregame = p_next_state->'pregame'->'home',
    away_pregame = p_next_state->'pregame'->'away',
    game_state = p_next_state,
    state_version = next_version,
    paused_at = case when p_next_state->>'status' = 'paused' then nullif(p_next_state->'paused'->>'pausedAt', '')::timestamptz else null end,
    paused_by_user_id = case when p_next_state->>'status' = 'paused' then nullif(p_next_state->'paused'->>'pausedByUserId', '')::uuid else null end,
    completed_at = case when p_next_state->>'status' = 'complete' and current_game.completed_at is null then now() else current_game.completed_at end,
    updated_at = now()
  where id = p_game_id
  returning * into saved_game;

  insert into public.game_events (
    game_id,
    state_version,
    event_type,
    actor_user_id,
    payload
  ) values (
    p_game_id,
    next_version,
    p_event_type,
    auth.uid(),
    coalesce(p_event_payload, '{}'::jsonb)
  )
  on conflict (game_id, state_version, event_type) do nothing;

  -- Rest-tracking update: only on the transition INTO 'complete' (never
  -- re-fires on a later save of an already-complete game, e.g. a retried/
  -- duplicate client write hitting an unchanged status).
  -- [Stage 3] Official games only, and only while official tracking is on.
  -- Pre-launch and practice games (every game today) never write persistent
  -- rest; their box scores and logs are kept like any other game's.
  if p_next_state->>'status' = 'complete' and current_game.status <> 'complete'
     and current_game.progression = 'official' and public.gameplay_official_tracking_enabled() then
    v_milestones := coalesce(p_next_state->'configuration'->'restMilestones', '[]'::jsonb);

    for v_side in select unnest(array['home','away'])
    loop
      v_user_id := (case v_side when 'home' then saved_game.home_user_id else saved_game.away_user_id end);
      v_roster := p_next_state->'pregame'->v_side->'roster'->'cards';
      if v_roster is null then continue; end if;

      v_hitter_appeared_keys := coalesce(p_next_state->'hitterPlateAppearanceCardKeys'->v_side, '[]'::jsonb);
      v_pitcher_appeared_keys := coalesce(p_next_state->'pitcherAppearanceCardKeys'->v_side, '[]'::jsonb);
      v_default_batter_keys := coalesce(p_next_state->'pregame'->v_side->'defaultBatterCardKeys', '[]'::jsonb);
      v_default_pitcher_keys := coalesce(p_next_state->'pregame'->v_side->'defaultPitcherCardKeys', '[]'::jsonb);

      -- Includes the game just completed above -- this row's own status was
      -- already written to 'complete' before this loop runs.
      select count(*) into v_gm_completed_games
      from public.games
      where status = 'complete'
        and progression = 'official' -- [Stage 3] only official games count toward milestones
        and season_id = saved_game.season_id
        and (home_user_id = v_user_id or away_user_id = v_user_id);

      v_milestone_bonus := 0;
      for v_milestone in select * from jsonb_array_elements(v_milestones)
      loop
        if (v_milestone->>'gamesPlayed')::int > 0
           and v_gm_completed_games % (v_milestone->>'gamesPlayed')::int = 0 then
          v_milestone_bonus := v_milestone_bonus + (v_milestone->>'bonusRestDays')::int;
        end if;
      end loop;

      for v_card_key in select jsonb_object_keys(v_roster)
      loop
        select coalesce(hitter_games_remaining, 0), coalesce(pitcher_games_remaining, 0)
        into v_prior_hitter, v_prior_pitcher
        from public.player_rest_state
        where user_id = v_user_id and season_id = saved_game.season_id and card_key = v_card_key;

        if not found then
          v_prior_hitter := 0;
          v_prior_pitcher := 0;
        end if;

        v_hitter_fatigue := (v_roster->v_card_key->'hitter'->>'fatigue')::int;
        v_pitcher_fatigue := (v_roster->v_card_key->'pitcher'->>'fatigue')::int;

        v_hitter_appeared := v_hitter_appeared_keys ? v_card_key
          and not (v_default_batter_keys ? v_card_key);
        v_pitcher_appeared := v_pitcher_appeared_keys ? v_card_key
          and not (v_default_pitcher_keys ? v_card_key);

        v_new_hitter := greatest(0,
          greatest(0, v_prior_hitter + (case when v_hitter_appeared then coalesce(v_hitter_fatigue, 0) else -1 end))
          - v_milestone_bonus);
        v_new_pitcher := greatest(0,
          greatest(0, v_prior_pitcher + (case when v_pitcher_appeared then coalesce(v_pitcher_fatigue, 0) else -1 end))
          - v_milestone_bonus);

        insert into public.player_rest_state (user_id, season_id, card_key, hitter_games_remaining, pitcher_games_remaining, updated_at)
        values (v_user_id, saved_game.season_id, v_card_key, v_new_hitter, v_new_pitcher, now())
        on conflict (user_id, season_id, card_key)
        do update set
          hitter_games_remaining = excluded.hitter_games_remaining,
          pitcher_games_remaining = excluded.pitcher_games_remaining,
          updated_at = now();
      end loop;
    end loop;
  end if;

  return to_jsonb(saved_game);
end;
$$;

grant execute on function public.save_gameplay_lab_state(uuid, bigint, jsonb, text, jsonb) to authenticated;

comment on function public.save_gameplay_lab_state(uuid, bigint, jsonb, text, jsonb) is
  'Gameplay writer. One-screen lab games: home writes everything. Two-player games (turnHandshake): either manager, on their own turn, never touching the other team, consuming server-issued dice. Refuses ended games, new pauses and ending a game by save. Applies the persistent Ftg/Rm rest update atomically when an official game first becomes complete while official tracking is on -- see restTracking.ts.';

commit;
