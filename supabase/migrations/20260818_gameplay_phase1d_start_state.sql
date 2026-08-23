-- Elements Baseball Gameplay Phase 1D — authoritative start-state persistence
-- Run after 20260818_gameplay_phase1b_pregame_state.sql.
-- Extends the private lab writer to permit GAME_READY and GAME_STARTED events.
--
-- This RPC is intentionally limited to the private gameplay allowlist and to the
-- authenticated tester's own home-side lab games. It adds expected-version
-- protection now so refreshes/double submits cannot silently overwrite newer state.

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

  if current_game.home_user_id <> auth.uid() then
    raise exception 'This private gameplay lab game does not belong to the authenticated tester.';
  end if;

  if current_game.state_version <> p_expected_state_version then
    raise exception 'Stale game state. Expected version %, current version is %.', p_expected_state_version, current_game.state_version;
  end if;

  if coalesce(p_next_state->>'gameId', '') <> p_game_id::text then
    raise exception 'Game state id does not match the target game.';
  end if;

  if coalesce(p_next_state->'managers'->'home'->>'userId', '') <> auth.uid()::text then
    raise exception 'Game state home manager does not match the authenticated tester.';
  end if;

  next_version := coalesce((p_next_state->>'stateVersion')::bigint, 0);
  if next_version <> p_expected_state_version + 1 then
    raise exception 'Next state version must be exactly one greater than the saved state.';
  end if;

  if p_event_type not in ('PREGAME_SUBMITTED', 'PREGAME_LOCKED', 'GAME_READY', 'GAME_STARTED', 'GAME_PAUSED', 'GAME_RESUMED') then
    raise exception 'Unsupported private gameplay lab event type: %', p_event_type;
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

  return to_jsonb(saved_game);
end;
$$;

grant execute on function public.save_gameplay_lab_state(uuid, bigint, jsonb, text, jsonb) to authenticated;

comment on function public.save_gameplay_lab_state(uuid, bigint, jsonb, text, jsonb) is
  'Private Gameplay Lab state writer with expected-version protection. This is a development bridge; production gameplay will use narrower server-authoritative action RPCs.';


comment on function public.save_gameplay_lab_state(uuid, bigint, jsonb, text, jsonb) is
  'Private Gameplay Lab writer through Phase 1D: expected-version protected pregame, ready/start, pause and resume events.';
