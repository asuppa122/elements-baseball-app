-- Elements Baseball — persistent per-player Ftg/Rm rest tracking (storage only).
-- Run once in the Supabase SQL Editor. NOT applied yet — reviewed with the user
-- before running, per standing project policy on schema changes.
--
-- This table holds ONLY the persisted "games remaining to rest" counters per
-- (manager, season, card). The math that produces new values each game
-- (appearance increment / flat per-game decrement / milestone bonus decrement)
-- lives in src/gameplay/restTracking.ts and is already covered by
-- restTrackingScenarioHarness.ts. Nothing here writes to this table yet — the
-- write path (a game-completion RPC, mirroring save_gameplay_lab_state's
-- pattern) is deliberately not included in this migration; see the chat
-- write-up alongside this file for the one open blocker on that piece
-- (precisely detecting who actually appeared as a hitter vs. pitcher this
-- game — today's `appearedCardKeys` on GameState is a start-of-game roster
-- snapshot, not a real per-player appearance record, and isn't precise enough
-- to drive fatigue accrual correctly).

create table if not exists public.player_rest_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  season_id text not null,
  card_key text not null,
  hitter_games_remaining integer not null default 0,
  pitcher_games_remaining integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, season_id, card_key),
  constraint player_rest_state_hitter_non_negative check (hitter_games_remaining >= 0),
  constraint player_rest_state_pitcher_non_negative check (pitcher_games_remaining >= 0)
);

-- Team Builder and pregame setup both need "every rest row for this manager's
-- current season," not single-card lookups — the primary key already serves
-- that (season_id, card_key are the trailing PK columns after user_id), but a
-- dedicated index keeps that specific query plan cheap as the table grows.
create index if not exists player_rest_state_user_season_idx
  on public.player_rest_state(user_id, season_id);

alter table public.player_rest_state enable row level security;

-- Read-only for the owning manager. There is deliberately no insert/update/
-- delete policy for authenticated users here — every write to this table must
-- go through a security-definer RPC (not yet written) that applies all three
-- rest-tracking steps atomically at game completion, so a manager can never
-- directly edit their own (or an opponent's) fatigue state, and so the three
-- update steps can't be split across two separate, independently-retriable
-- client writes.
drop policy if exists "Managers can view their own rest state" on public.player_rest_state;
create policy "Managers can view their own rest state"
on public.player_rest_state for select
to authenticated
using (user_id = (select auth.uid()));

comment on table public.player_rest_state is
  'Persistent cross-game Ftg/Rm rest counters, one row per (manager, season, card). Written only by the (not-yet-built) game-completion RPC -- see src/gameplay/restTracking.ts for the update-sequence math this table stores the output of.';
