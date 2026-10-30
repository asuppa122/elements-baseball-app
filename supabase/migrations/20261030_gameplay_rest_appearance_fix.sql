-- Elements Baseball — postgame rest: a player who appeared does not also get
-- the day's -1.
-- Run once in the Supabase SQL Editor, after 20261029_gameplay_two_player.sql.
--
-- STATUS: written 2026-10-30, NOT applied yet. Tested against a real Postgres
-- (PGlite) by twoPlayerSql.test.ts and against restTracking.ts by
-- restTrackingSqlParity.test.ts.
--
-- Found in the first live two-player game (2026-10-30): Rube Curry pitched and
-- finished one game short of where he should have; Nelson Dean sat and was
-- correct. The Rulebook's own examples (Section IX-B) settle it -- a hitter 2
-- games from rested with card fatigue 6 who appears is "8 games away heading
-- into the following game" (2 + 6), a starter 2 away with fatigue 5 is 7. The
-- previous rule subtracted the flat per-game -1 from everyone, so appearing
-- players came out at 7 and 6. Now:
--   appeared:      prior + card fatigue
--   did not appear: prior - 1
-- then the season's milestone bonus for everyone, as before. Floors at 0.
-- Default-attributes players still count as not appearing (no accrual).
--
-- The only change is the two v_new_* expressions. Everything else is
-- 20261029_gameplay_two_player.sql's writer, verbatim.


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
  'Gameplay writer. One-screen lab games: home writes everything. Two-player games (turnHandshake): either manager, on their own turn, never touching the other team, consuming server-issued dice. Applies the persistent Ftg/Rm rest update atomically when a game first becomes complete -- see restTracking.ts.';
