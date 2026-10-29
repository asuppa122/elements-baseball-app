-- Elements Baseball — two-player games: both managers write, on their own
-- turn, with dice rolled by the server.
-- Run once in the Supabase SQL Editor, after 20260827_gameplay_away_side_access.sql.
--
-- STATUS: written 2026-10-29. Tested against a real Postgres (PGlite, PG 18)
-- by src/gameplay/__tests__/twoPlayerSql.test.ts, which applies the gameplay
-- migrations in order plus this one and plays complete games through the real
-- engine, each move submitted by the correct manager. NOT yet applied to the
-- live project -- update this line when it is.
--
-- What changes, and what deliberately does not:
--
-- * One-screen lab games (every game that exists today) are untouched: they
--   keep exactly the old rule, home writes everything with client dice. The
--   new rules apply only to a game created as two-player, i.e. whose state
--   carries "turnHandshake": true.
--
-- * In a two-player game either manager may save, but only:
--     - on their own turn -- public.gameplay_side_to_act mirrors
--       src/gameplay/turnOrder.ts sideToAct (offence readies, then defence
--       pitches; a pending decision belongs to its acting side). Pause,
--       resume, pregame and start are not turn-bound;
--     - without touching the other team: the other side's pregame and rest
--       state, the managers block and the two-player flag must arrive
--       unchanged;
--     - with a die the server rolled. public.roll_gameplay_die issues one
--       roll per (game, state version, kind); asking again returns the same
--       number, so a manager cannot re-roll. A save that needs a die must
--       carry that roll, and once a roll has been issued for a moment the next
--       save must be the move that consumes it -- you cannot see your pitch
--       roll and decide to walk the batter instead.
--
-- * Still trusted from the client, as before: the engine's resulting state.
--   The rules engine runs in the browser; this checks who moved and what die
--   they used, not every rule. Moving the engine server-side is the step
--   before league games count.

-- 1) Server dice ----------------------------------------------------------

create table if not exists public.game_rolls (
  game_id uuid not null references public.games(id) on delete cascade,
  state_version bigint not null,
  roll_kind text not null check (roll_kind in ('pitch', 'swing', 'decision')),
  roll integer not null check (roll between 1 and 20),
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (game_id, state_version, roll_kind)
);

-- No client policies: only the security-definer functions below touch it. The
-- roll a move used is recorded in that move's game_events payload.
alter table public.game_rolls enable row level security;

-- 2) Whose move it is -- mirrors turnOrder.ts sideToAct ---------------------

create or replace function public.gameplay_side_to_act(s jsonb)
returns text
language sql
immutable
as $$
  select case
    when coalesce(s->>'status', '') not in ('in_progress', 'awaiting_decision', 'inning_transition') then null
    when jsonb_typeof(s->'pendingDecision') = 'object' then s->'pendingDecision'->>'actingSide'
    when s->>'waitingFor' = 'PITCH_ROLL' then
      case
        when coalesce((s->>'turnHandshake')::boolean, false)
             and s->>'status' = 'in_progress'
             and coalesce((s->'plateAppearance'->>'offenseReady')::boolean, false) = false
          then case when s->>'half' = 'top' then 'away' else 'home' end
        else case when s->>'half' = 'top' then 'home' else 'away' end
      end
    when s->>'waitingFor' = 'SWING_ROLL' then case when s->>'half' = 'top' then 'away' else 'home' end
    else s->>'nextActor'
  end;
$$;

grant execute on function public.gameplay_side_to_act(jsonb) to authenticated;

create or replace function public.roll_gameplay_die(
  p_game_id uuid,
  p_state_version bigint,
  p_kind text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  s jsonb;
  v_caller text;
  v_roll integer;
begin
  if not public.has_gameplay_lab_access() then
    raise exception 'Gameplay lab access is not enabled for this account.';
  end if;

  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'Game not found.'; end if;
  s := g.game_state;

  if not coalesce((s->>'turnHandshake')::boolean, false) then
    raise exception 'Server dice are only used in two-player games.';
  end if;

  v_caller := case auth.uid() when g.home_user_id then 'home' when g.away_user_id then 'away' else null end;
  if v_caller is null then raise exception 'You are not a manager in this game.'; end if;

  if g.state_version <> p_state_version then
    raise exception 'Stale game state. Expected version %, current version is %.', p_state_version, g.state_version;
  end if;

  if public.gameplay_side_to_act(s) is distinct from v_caller then
    raise exception 'It is not your turn.';
  end if;

  if p_kind = 'pitch' then
    if s->>'waitingFor' <> 'PITCH_ROLL' or jsonb_typeof(s->'pendingDecision') = 'object' then
      raise exception 'The game is not waiting for a pitch.';
    end if;
  elsif p_kind = 'swing' then
    if s->>'waitingFor' <> 'SWING_ROLL' or jsonb_typeof(s->'pendingDecision') = 'object' then
      raise exception 'The game is not waiting for a swing.';
    end if;
  elsif p_kind = 'decision' then
    if jsonb_typeof(s->'pendingDecision') <> 'object' then
      raise exception 'There is no decision waiting on a roll.';
    end if;
  else
    raise exception 'Unknown roll kind: %', p_kind;
  end if;

  insert into public.game_rolls (game_id, state_version, roll_kind, roll, requested_by)
  values (p_game_id, p_state_version, p_kind, 1 + floor(random() * 20)::integer, auth.uid())
  on conflict (game_id, state_version, roll_kind) do nothing;

  select roll into v_roll
  from public.game_rolls
  where game_id = p_game_id and state_version = p_state_version and roll_kind = p_kind;

  return v_roll;
end;
$$;

grant execute on function public.roll_gameplay_die(uuid, bigint, text) to authenticated;

-- 3) Opponents who can actually play -------------------------------------

-- list_gameplay_lab_opponents offers every claimed profile, but an opponent
-- without gameplay access cannot even read the game. Offer only those who can.
create or replace function public.list_gameplay_opponents()
returns table (user_id uuid, manager_name text, avatar_url text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_gameplay_lab_access() then
    raise exception 'Gameplay lab access is not enabled for this account.';
  end if;

  return query
  select p.user_id, p.manager_name, p.avatar_url
  from public.profiles p
  join public.gameplay_feature_access a on a.user_id = p.user_id
  where p.user_id <> auth.uid()
  order by p.manager_name;
end;
$$;

grant execute on function public.list_gameplay_opponents() to authenticated;

-- 4) The writer ------------------------------------------------------------
-- Same signature as before (create or replace), so gameRepository.ts call
-- sites are unchanged. Everything after the access checks -- the update, the
-- event row and the rest-tracking block on completion -- is carried over
-- verbatim from 20260826_gameplay_rest_tracking_on_completion.sql.

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

  if p_event_type not in ('PREGAME_SUBMITTED', 'PREGAME_LOCKED', 'GAME_READY', 'GAME_STARTED', 'OFFENSE_READY', 'PITCH_ROLLED', 'SWING_RESOLVED', 'DECISION_RESOLVED', 'GAME_PAUSED', 'GAME_RESUMED') then
    raise exception 'Unsupported private gameplay lab event type: %', p_event_type;
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
  if p_next_state->>'status' = 'complete' and current_game.status <> 'complete' then
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
          greatest(0, v_prior_hitter + (case when v_hitter_appeared then coalesce(v_hitter_fatigue, 0) else 0 end) - 1)
          - v_milestone_bonus);
        v_new_pitcher := greatest(0,
          greatest(0, v_prior_pitcher + (case when v_pitcher_appeared then coalesce(v_pitcher_fatigue, 0) else 0 end) - 1)
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
  'Gameplay writer. One-screen lab games: home writes everything. Two-player games (turnHandshake): either manager, on their own turn, never touching the other team, consuming server-issued dice. Applies the persistent Ftg/Rm rest update atomically when a game first becomes complete -- see restTracking.ts.';
