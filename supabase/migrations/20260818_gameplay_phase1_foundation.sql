-- Elements Baseball Gameplay Phase 1 — authoritative resumable game foundation
-- Run once in the Supabase SQL Editor before wiring the private pregame UI.

create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  season_id text not null,
  season_year integer not null,
  status text not null default 'pregame'
    check (status in ('setup','pregame','ready','in_progress','awaiting_decision','inning_transition','paused','complete')),
  home_user_id uuid not null references auth.users(id) on delete restrict,
  away_user_id uuid not null references auth.users(id) on delete restrict,
  configuration_snapshot jsonb not null,
  home_roster_snapshot jsonb,
  away_roster_snapshot jsonb,
  home_pregame jsonb not null default '{}'::jsonb,
  away_pregame jsonb not null default '{}'::jsonb,
  game_state jsonb not null default '{}'::jsonb,
  state_version bigint not null default 1,
  paused_at timestamptz,
  paused_by_user_id uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_distinct_managers check (home_user_id <> away_user_id)
);

create index if not exists games_home_user_idx on public.games(home_user_id, updated_at desc);
create index if not exists games_away_user_idx on public.games(away_user_id, updated_at desc);
create index if not exists games_status_idx on public.games(status, updated_at desc);

create table if not exists public.game_events (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  state_version bigint not null,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(game_id, state_version, event_type)
);

create index if not exists game_events_game_idx on public.game_events(game_id, state_version, id);

alter table public.games enable row level security;
alter table public.game_events enable row level security;

-- Phase 1 keeps access participant-only. The public app does not expose gameplay UI yet.
drop policy if exists "Game participants can view games" on public.games;
create policy "Game participants can view games"
on public.games for select
to authenticated
using ((select auth.uid()) in (home_user_id, away_user_id));

drop policy if exists "Game participants can create games" on public.games;
create policy "Game participants can create games"
on public.games for insert
to authenticated
with check ((select auth.uid()) = home_user_id or (select auth.uid()) = away_user_id);

-- Direct client updates are deliberately not enabled in Phase 1. Gameplay writes should
-- move through version-checked RPCs in Phase 2 so two browsers cannot overwrite each other.

drop policy if exists "Game participants can view game events" on public.game_events;
create policy "Game participants can view game events"
on public.game_events for select
to authenticated
using (
  exists (
    select 1 from public.games g
    where g.id = game_id
      and (select auth.uid()) in (g.home_user_id, g.away_user_id)
  )
);

comment on table public.games is
  'Authoritative resumable Elements Baseball game records. configuration_snapshot and roster snapshots are frozen at game creation/pregame so later Team Builder edits do not alter active games.';

comment on table public.game_events is
  'Append-only gameplay event/audit foundation. Version-checked write RPCs are intentionally deferred to Gameplay Phase 2.';
