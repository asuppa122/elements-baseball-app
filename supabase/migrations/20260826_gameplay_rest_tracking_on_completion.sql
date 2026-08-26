-- Elements Baseball — persistent Ftg/Rm rest-tracking update on game completion.
-- Run after 20260826_gameplay_player_rest_state.sql. NOT applied yet -- review
-- before running, same as any schema change, and see the accompanying chat
-- write-up for two open items this migration deliberately does NOT resolve
-- on its own (real-world verification, and one modeling choice worth a
-- second look before this is trusted).
--
-- Extends save_gameplay_lab_state in place (same signature -- this is a
-- `create or replace`, not a new function) so gameRepository.ts needs no
-- changes: every existing call site already routes every state save,
-- including the one where a game's status first becomes 'complete', through
-- this one function. When that transition is detected, this migration adds
-- one additional, atomic step in the SAME transaction as the games update:
-- apply restTracking.ts's three-step sequence (appearance increment / flat
-- per-game decrement / milestone bonus decrement) to every player on both
-- rosters, and upsert the results into player_rest_state.
--
-- Deliberately NOT trusting any client-submitted fatigue numbers -- this
-- reads the roster snapshot, the new hitterPlateAppearanceCardKeys /
-- pitcherAppearanceCardKeys markers, and the season's restMilestones
-- straight out of p_next_state itself (already trusted at the same level as
-- every other field in that JSON blob, matching this RPC's existing trust
-- model -- it does not re-derive gameplay results either). A manager cannot
-- separately submit arbitrary rest-state rows; there is no parameter for
-- that here at all.
--
-- Modeling choice worth confirming (see chat writeup): the Rulebook's
-- default-attributes GM override ("...in order to avoid accruing fatigue
-- effects") is read here as exempting ONLY the appearance increment for that
-- player this game -- the flat per-game decrement and any milestone bonus
-- still apply to a default-attributes player, since those are rest-day
-- grants, not accrual, and the Rulebook offers no carve-out from a benefit.
-- Flagging this explicitly rather than treating it as self-evidently
-- correct.

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

  if p_event_type not in ('PREGAME_SUBMITTED', 'PREGAME_LOCKED', 'GAME_READY', 'GAME_STARTED', 'PITCH_ROLLED', 'SWING_RESOLVED', 'DECISION_RESOLVED', 'GAME_PAUSED', 'GAME_RESUMED') then
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
  'Private Gameplay Lab writer. Also applies the three-step persistent Ftg/Rm rest-tracking update atomically the moment a game''s status first becomes complete -- see restTracking.ts for the equivalent, independently-tested TypeScript logic this SQL mirrors.';
