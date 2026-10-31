-- Elements Baseball — ROLLBACK for 20261031_gameplay_one_active_game.sql.
-- Only if a problem is found after the migration and a forward fix is not
-- quicker. Run all of it in the Supabase SQL Editor; one transaction.
--
-- Restores the previous app's behaviour -- the browser may insert games again
-- (the old app's create path), the old events are accepted, and the one-game
-- limit, cancellation and ending functions are gone -- WITHOUT breaking the
-- pre-launch rule:
--   * the writer restored here is 20261030's, verbatim except that persistent
--     rest is written only while official tracking is on (it is off), and only
--     official games count toward milestones -- so games complete normally and
--     nothing is recorded;
--   * the official-tracking switch (gameplay_settings) and the
--     gameplay_rest_write_guard trigger are KEPT: even if someone later
--     re-runs the original 20261030 writer by mistake, its rest write is
--     refused and the completing save fails, rather than recording rest.
-- Do NOT re-run 20261030_gameplay_rest_appearance_fix.sql after this.
--
-- Also kept, because removing them would lose information and the old code
-- ignores them: the new columns, the 14 closed practice games (they stay
-- `terminated`; the status check keeps the new values), the settings history.
-- Re-applying the migration later is safe.
--
-- Deploy the previous app version together with this, or the new app's games
-- page will fail to load.
--
-- STATUS: written 2026-10-31; tested by oneActiveGameSql.test.ts (apply, roll
-- back, the old flows work, a completed game records no rest, the original
-- writer re-run by mistake is refused) and rehearsed on a copy of the live data
-- by scripts/dry-run-rollout.mjs. NOT run.

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


-- The previous writer, with the pre-launch protection kept (see above).
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
  -- [ROLLBACK] Pre-launch protection kept: rest is written only while
  -- official tracking is on, so a rolled-back site still records nothing
  -- before launch. Games complete normally.
  if p_next_state->>'status' = 'complete' and current_game.status <> 'complete'
     and public.gameplay_official_tracking_enabled() then
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
        and coalesce(progression, 'prelaunch') = 'official' -- [ROLLBACK] pre-launch games never count
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

commit;
