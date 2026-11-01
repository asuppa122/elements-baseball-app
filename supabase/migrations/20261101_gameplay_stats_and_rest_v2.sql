-- Elements Baseball — rules v2 statistics, official records and rest (2026-11-01)
--
-- STATUS: LOCAL ONLY. Written and tested on PGlite (devDb.ts, restRulesSql.test.ts,
-- officialStatsSql.test.ts, exhibitionCleanupSql.test.ts). NOT applied to the live
-- project. Applying it needs Anthony's separate explicit authorization, a fresh
-- read-only snapshot first, and a rollout record (see OPERATIONS.md). It changes
-- no existing row: every addition is a new column with a default, a new table
-- (empty), or a function. Official tracking stays OFF.
--
-- What it does (one transaction):
--   1. Exhibition / official classification: games.competition_class, derived from
--      the server-assigned, immutable `progression` -- 'official' only for an
--      official game; everything else (prelaunch, practice, untracked) is an
--      exhibition (Anthony, audit decision 13). Never set by a client.
--   2. player_rest_state.last_pitcher_appearance_game_index (efficiency's
--      back-to-back test).
--   3. The writer save_gameplay_lab_state gains the three pitcher rest
--      adjustments for rules-v2 games (negative Control +1, relief distance +1,
--      efficiency -1 with BF >= 1 and BF <= outs). Everything else in it is
--      byte-for-byte the 20261031 text. Rest is still written only for an
--      official game, on its first transition into complete, while official
--      tracking is on.
--   4. Official statistics: four empty tables, readable by signed-in users, with
--      NO write grant to any app role; one writer function callable only by the
--      database owner / service role, refusing unless the game is official and
--      complete, official tracking is on AND the separate
--      official_stats_writer_enabled switch (OFF) is on. Idempotent: a game's
--      rows are replaced, never added to.
--   5. Exhibition cleanup, prepared but never run: a read-only preview and an
--      owner-only delete that requires a typed confirmation and the exact count
--      the preview returned. Official games, accounts, cards, rosters and
--      line-ups are untouched by construction.

begin;

-- 1) Classification -------------------------------------------------------------
alter table public.games add column if not exists competition_class text
  generated always as (case when progression = 'official' then 'official' else 'exhibition' end) stored;
comment on column public.games.competition_class is
  'exhibition | official. Derived from progression (server-assigned at creation, immutable). Only official games may ever feed season statistics, standings, records or official rest.';

-- 2) Back-to-back marker -----------------------------------------------------------
alter table public.player_rest_state add column if not exists last_pitcher_appearance_game_index bigint;
comment on column public.player_rest_state.last_pitcher_appearance_game_index is
  'The GM''s completed-official-game count at this card''s last rest appearance as a pitcher; back-to-back = equal to the current count minus 1.';

-- Card IP (baseball thirds: .33 = one out, .67 = two) as outs; mirrors cardIpOuts in fatigueEngine.ts.
create or replace function public.gameplay_card_ip_outs(p_ip numeric)
returns int
language sql
immutable
as $$
  select case
    when p_ip is null or p_ip <= 0 then 0
    else floor(p_ip)::int * 3 + case
      when p_ip - floor(p_ip) >= 0.5 then 2
      when p_ip - floor(p_ip) >= 0.3 then 1
      when p_ip - floor(p_ip) >= 0.15 then 2
      when p_ip - floor(p_ip) >= 0.05 then 1
      else 0 end
  end
$$;

-- 3) The writer, with the v2 rest adjustments --------------------------------------
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
  -- [v2 rest] per-pitcher facts and the three Rulebook §8 adjustments.
  v_facts jsonb;
  v_rules_v2 boolean;
  v_outs int;
  v_bf int;
  v_card_ip_outs int;
  v_back_to_back boolean;
  v_last_index bigint;
  v_relief int;
  v_efficiency boolean;
  v_negative int;
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

      v_rules_v2 := coalesce((p_next_state->>'rulesVersion')::int, 1) >= 2;

      for v_card_key in select jsonb_object_keys(v_roster)
      loop
        select coalesce(hitter_games_remaining, 0), coalesce(pitcher_games_remaining, 0), last_pitcher_appearance_game_index
        into v_prior_hitter, v_prior_pitcher, v_last_index
        from public.player_rest_state
        where user_id = v_user_id and season_id = saved_game.season_id and card_key = v_card_key;

        if not found then
          v_prior_hitter := 0;
          v_prior_pitcher := 0;
          v_last_index := null;
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
        -- [v2 rest] Rulebook §8 pitcher adjustments, rules-v2 games only
        -- (Anthony, 2026-11-01). Order: prior + card fatigue + relief distance
        -- -> efficiency (floor 0) -> negative Control -> milestone (floor 0).
        -- Mirrors src/gameplay/restRules.ts exactly (restRulesSql.test.ts).
        v_relief := 0;
        v_efficiency := false;
        v_negative := 0;
        if v_rules_v2 and v_pitcher_appeared then
          v_facts := p_next_state->'pitcherRestFacts'->(v_side || '::' || v_card_key);
          if v_facts is not null then
            v_outs := coalesce((v_facts->>'outsRecorded')::int, 0);
            v_bf := coalesce((v_facts->>'battersFaced')::int, 0);
            v_card_ip_outs := public.gameplay_card_ip_outs((v_roster->v_card_key->'pitcher'->>'ip')::numeric);
            v_back_to_back := v_last_index is not null and v_last_index = v_gm_completed_games - 1;
            -- Relief distance (IX-C; ruling 7): a reliever strictly beyond card IP and beyond 1.0 IP.
            if not coalesce((v_facts->>'starter')::boolean, false) and v_outs > 3 and v_outs > v_card_ip_outs then
              v_relief := 1;
            end if;
            -- Efficiency (IX-B; audit decision 7): BF >= 1 and BF <= outs, not back-to-back.
            v_efficiency := v_bf >= 1 and v_bf <= v_outs and not v_back_to_back;
            -- Negative Control (IX-C): Control 1+ at his first pitch, and a pitch thrown at -1 or lower.
            if coalesce((v_facts->>'controlAtFirstPitch')::int, -99) >= 1 and coalesce((v_facts->>'pitchedAtNegativeControl')::boolean, false) then
              v_negative := 1;
            end if;
          end if;
        end if;

        v_new_pitcher := greatest(0,
          greatest(0, v_prior_pitcher + (case when v_pitcher_appeared then coalesce(v_pitcher_fatigue, 0) + v_relief else -1 end)
            - (case when v_efficiency then 1 else 0 end))
          + v_negative
          - v_milestone_bonus);

        insert into public.player_rest_state (user_id, season_id, card_key, hitter_games_remaining, pitcher_games_remaining, last_pitcher_appearance_game_index, updated_at)
        values (v_user_id, saved_game.season_id, v_card_key, v_new_hitter, v_new_pitcher,
          case when v_pitcher_appeared then v_gm_completed_games else v_last_index end, now())
        on conflict (user_id, season_id, card_key)
        do update set
          hitter_games_remaining = excluded.hitter_games_remaining,
          pitcher_games_remaining = excluded.pitcher_games_remaining,
          last_pitcher_appearance_game_index = excluded.last_pitcher_appearance_game_index,
          updated_at = now();
      end loop;
    end loop;
  end if;

  return to_jsonb(saved_game);
end;
$$;

grant execute on function public.save_gameplay_lab_state(uuid, bigint, jsonb, text, jsonb) to authenticated;

-- 4) Official statistics -------------------------------------------------------------
alter table public.gameplay_settings add column if not exists official_stats_writer_enabled boolean not null default false;
comment on column public.gameplay_settings.official_stats_writer_enabled is
  'Second switch for the official statistics writer, OFF. Turned on only by the database owner after Anthony authorises official statistics; official tracking must also be on.';

create table if not exists public.official_game_results (
  game_id uuid primary key references public.games(id) on delete restrict,
  season_id text not null,
  home_user_id uuid not null,
  away_user_id uuid not null,
  home_runs int not null,
  away_runs int not null,
  winner_side text not null check (winner_side in ('home','away')),
  scoring_version int not null,
  written_at timestamptz not null default now()
);

create table if not exists public.official_batting_lines (
  game_id uuid not null references public.official_game_results(game_id) on delete cascade,
  season_id text not null,
  user_id uuid not null,
  side text not null check (side in ('home','away')),
  card_key text not null,
  g int not null default 0, pa int not null default 0, ab int not null default 0, r int not null default 0, h int not null default 0,
  b1 int not null default 0, b2 int not null default 0, b3 int not null default 0, hr int not null default 0, rbi int not null default 0,
  sb int not null default 0, cs int not null default 0, bb int not null default 0, so int not null default 0,
  oba int not null default 0, ocho int not null default 0, pchw int not null default 0, gidp int not null default 0, sac int not null default 0, sf int not null default 0,
  primary key (game_id, side, card_key)
);

create table if not exists public.official_pitching_lines (
  game_id uuid not null references public.official_game_results(game_id) on delete cascade,
  season_id text not null,
  user_id uuid not null,
  side text not null check (side in ('home','away')),
  card_key text not null,
  g int not null default 0, gs int not null default 0, qs int not null default 0, w int not null default 0, l int not null default 0,
  cg int not null default 0, sho int not null default 0, hld int not null default 0, bsv int not null default 0, sv int not null default 0,
  bf int not null default 0, outs int not null default 0, h int not null default 0, bb int not null default 0, b2 int not null default 0,
  b3 int not null default 0, hr int not null default 0, r int not null default 0, er int not null default 0, so int not null default 0,
  ochw int not null default 0, hcho int not null default 0, adv int not null default 0,
  primary key (game_id, side, card_key)
);

create table if not exists public.official_fielding_lines (
  game_id uuid not null references public.official_game_results(game_id) on delete cascade,
  season_id text not null,
  user_id uuid not null,
  side text not null check (side in ('home','away')),
  card_key text not null,
  positions text[] not null default '{}',
  cs int not null default 0, sba int not null default 0, dbp int not null default 0, dbpa int not null default 0,
  tbp int not null default 0, tbpa int not null default 0, ofa int not null default 0,
  primary key (game_id, side, card_key)
);

create index if not exists official_batting_lines_season_idx on public.official_batting_lines(season_id, user_id, card_key);
create index if not exists official_pitching_lines_season_idx on public.official_pitching_lines(season_id, user_id, card_key);

alter table public.official_game_results enable row level security;
alter table public.official_batting_lines enable row level security;
alter table public.official_pitching_lines enable row level security;
alter table public.official_fielding_lines enable row level security;
-- No app role writes these: revoke everything, then grant read to signed-in users.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.official_game_results, public.official_batting_lines, public.official_pitching_lines, public.official_fielding_lines from %I', r);
    end if;
  end loop;
end;
$$;
grant select on public.official_game_results, public.official_batting_lines, public.official_pitching_lines, public.official_fielding_lines to authenticated;
drop policy if exists "Signed-in users read official results" on public.official_game_results;
create policy "Signed-in users read official results" on public.official_game_results for select to authenticated using (true);
drop policy if exists "Signed-in users read official batting" on public.official_batting_lines;
create policy "Signed-in users read official batting" on public.official_batting_lines for select to authenticated using (true);
drop policy if exists "Signed-in users read official pitching" on public.official_pitching_lines;
create policy "Signed-in users read official pitching" on public.official_pitching_lines for select to authenticated using (true);
drop policy if exists "Signed-in users read official fielding" on public.official_fielding_lines;
create policy "Signed-in users read official fielding" on public.official_fielding_lines for select to authenticated using (true);

-- Season totals: sums of game lines (rates are computed from these counts by the app).
create or replace view public.official_season_batting with (security_invoker = true) as
  select season_id, user_id, card_key,
    sum(g)::int g, sum(pa)::int pa, sum(ab)::int ab, sum(r)::int r, sum(h)::int h, sum(b1)::int b1, sum(b2)::int b2, sum(b3)::int b3,
    sum(hr)::int hr, sum(rbi)::int rbi, sum(sb)::int sb, sum(cs)::int cs, sum(bb)::int bb, sum(so)::int so,
    sum(oba)::int oba, sum(ocho)::int ocho, sum(pchw)::int pchw, sum(gidp)::int gidp, sum(sac)::int sac, sum(sf)::int sf
  from public.official_batting_lines group by season_id, user_id, card_key;
create or replace view public.official_season_pitching with (security_invoker = true) as
  select season_id, user_id, card_key,
    sum(g)::int g, sum(gs)::int gs, sum(qs)::int qs, sum(w)::int w, sum(l)::int l, sum(cg)::int cg, sum(sho)::int sho,
    sum(hld)::int hld, sum(bsv)::int bsv, sum(sv)::int sv, sum(bf)::int bf, sum(outs)::int outs, sum(h)::int h, sum(bb)::int bb,
    sum(b2)::int b2, sum(b3)::int b3, sum(hr)::int hr, sum(r)::int r, sum(er)::int er, sum(so)::int so,
    sum(ochw)::int ochw, sum(hcho)::int hcho, sum(adv)::int adv
  from public.official_pitching_lines group by season_id, user_id, card_key;
grant select on public.official_season_batting, public.official_season_pitching to authenticated;

/**
 * The official statistics writer. p_lines is computed by the trusted statistics
 * module (src/gameplay/stats/officialPayload.ts) from the completed game's play
 * log. Refuses unless: the game exists, is complete and official; official
 * tracking is on; official_stats_writer_enabled is on; the payload's final
 * score equals the saved game's; every card belongs to that side's frozen
 * roster. Replaces the game's rows (a correction re-scores, never adds).
 */
create or replace function public.gameplay_write_official_stats(p_game_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  v_enabled boolean;
  v_side text;
  v_line jsonb;
  v_user uuid;
  v_counts jsonb;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'No such game.'; end if;
  if g.status <> 'complete' then raise exception 'Only a completed game has official statistics.'; end if;
  if g.progression <> 'official' then raise exception 'Exhibition games never write official statistics.'; end if;
  if not public.gameplay_official_tracking_enabled() then raise exception 'Official tracking is off.'; end if;
  select official_stats_writer_enabled into v_enabled from public.gameplay_settings limit 1;
  if not coalesce(v_enabled, false) then raise exception 'The official statistics writer is switched off.'; end if;
  if (p_lines->'final'->>'home')::int is distinct from (g.game_state->'score'->>'home')::int
     or (p_lines->'final'->>'away')::int is distinct from (g.game_state->'score'->>'away')::int then
    raise exception 'The statistics do not match the saved final score.';
  end if;
  if (g.game_state->'score'->>'home')::int = (g.game_state->'score'->>'away')::int then
    raise exception 'A tied game has no official result.';
  end if;

  delete from public.official_game_results where game_id = p_game_id;
  insert into public.official_game_results (game_id, season_id, home_user_id, away_user_id, home_runs, away_runs, winner_side, scoring_version)
  values (p_game_id, g.season_id, g.home_user_id, g.away_user_id,
    (g.game_state->'score'->>'home')::int, (g.game_state->'score'->>'away')::int,
    case when (g.game_state->'score'->>'home')::int > (g.game_state->'score'->>'away')::int then 'home' else 'away' end,
    coalesce((p_lines->>'scoringVersion')::int, 1));

  for v_side in select unnest(array['home','away'])
  loop
    v_user := case v_side when 'home' then g.home_user_id else g.away_user_id end;
    for v_line in select * from jsonb_array_elements(coalesce(p_lines->'batting'->v_side, '[]'::jsonb))
    loop
      if not (g.game_state->'pregame'->v_side->'roster'->'cards' ? (v_line->>'cardKey')) then
        raise exception 'Card % is not on the % roster of this game.', v_line->>'cardKey', v_side;
      end if;
      insert into public.official_batting_lines (game_id, season_id, user_id, side, card_key, g, pa, ab, r, h, b1, b2, b3, hr, rbi, sb, cs, bb, so, oba, ocho, pchw, gidp, sac, sf)
      values (p_game_id, g.season_id, v_user, v_side, v_line->>'cardKey',
        (v_line->>'G')::int, (v_line->>'PA')::int, (v_line->>'AB')::int, (v_line->>'R')::int, (v_line->>'H')::int,
        (v_line->>'1B')::int, (v_line->>'2B')::int, (v_line->>'3B')::int, (v_line->>'HR')::int, (v_line->>'RBI')::int,
        (v_line->>'SB')::int, (v_line->>'CS')::int, (v_line->>'BB')::int, (v_line->>'SO')::int,
        (v_line->>'OBA')::int, (v_line->>'OCHO')::int, (v_line->>'PCHW')::int, (v_line->>'GIDP')::int, (v_line->>'SAC')::int, (v_line->>'SF')::int);
    end loop;
    for v_line in select * from jsonb_array_elements(coalesce(p_lines->'pitching'->v_side, '[]'::jsonb))
    loop
      if not (g.game_state->'pregame'->v_side->'roster'->'cards' ? (v_line->>'cardKey')) then
        raise exception 'Card % is not on the % roster of this game.', v_line->>'cardKey', v_side;
      end if;
      insert into public.official_pitching_lines (game_id, season_id, user_id, side, card_key, g, gs, qs, w, l, cg, sho, hld, bsv, sv, bf, outs, h, bb, b2, b3, hr, r, er, so, ochw, hcho, adv)
      values (p_game_id, g.season_id, v_user, v_side, v_line->>'cardKey',
        (v_line->>'G')::int, (v_line->>'GS')::int, (v_line->>'QS')::int, (v_line->>'W')::int, (v_line->>'L')::int,
        (v_line->>'CG')::int, (v_line->>'SHO')::int, (v_line->>'HLD')::int, (v_line->>'BSV')::int, (v_line->>'SV')::int,
        (v_line->>'BF')::int, (v_line->>'outs')::int, (v_line->>'H')::int, (v_line->>'BB')::int, (v_line->>'2B')::int,
        (v_line->>'3B')::int, (v_line->>'HR')::int, (v_line->>'R')::int, (v_line->>'ER')::int, (v_line->>'SO')::int,
        (v_line->>'OCHW')::int, (v_line->>'HCHO')::int, (v_line->>'ADV')::int);
    end loop;
    for v_line in select * from jsonb_array_elements(coalesce(p_lines->'fielding'->v_side, '[]'::jsonb))
    loop
      if not (g.game_state->'pregame'->v_side->'roster'->'cards' ? (v_line->>'cardKey')) then
        raise exception 'Card % is not on the % roster of this game.', v_line->>'cardKey', v_side;
      end if;
      insert into public.official_fielding_lines (game_id, season_id, user_id, side, card_key, positions, cs, sba, dbp, dbpa, tbp, tbpa, ofa)
      values (p_game_id, g.season_id, v_user, v_side, v_line->>'cardKey',
        coalesce(array(select jsonb_array_elements_text(v_line->'positions')), '{}'),
        (v_line->>'CS')::int, (v_line->>'SBa')::int, (v_line->>'DBP')::int, (v_line->>'DBPa')::int,
        (v_line->>'TBP')::int, (v_line->>'TBPa')::int, (v_line->>'OFA')::int);
    end loop;
  end loop;

  select jsonb_build_object(
    'batting', (select count(*) from public.official_batting_lines where game_id = p_game_id),
    'pitching', (select count(*) from public.official_pitching_lines where game_id = p_game_id),
    'fielding', (select count(*) from public.official_fielding_lines where game_id = p_game_id)
  ) into v_counts;
  return v_counts;
end;
$$;
revoke all on function public.gameplay_write_official_stats(uuid, jsonb) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.gameplay_write_official_stats(uuid, jsonb) from %I', r);
    end if;
  end loop;
  -- The trusted server (service role) is the only caller besides the owner.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.gameplay_write_official_stats(uuid, jsonb) to service_role';
  end if;
end;
$$;

-- 5) Exhibition cleanup -- prepared, never run ---------------------------------------
-- Read-only: what a cleanup would delete. Rows hang off games by foreign key
-- (game_events, game_rolls, gameplay_active_games cascade with the game).
create or replace function public.gameplay_exhibition_cleanup_preview()
returns table (exhibition_games bigint, game_events bigint, game_rolls bigint, active_registrations bigint, official_games_untouched bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.games where competition_class = 'exhibition'),
    (select count(*) from public.game_events e join public.games g on g.id = e.game_id where g.competition_class = 'exhibition'),
    (select count(*) from public.game_rolls r join public.games g on g.id = r.game_id where g.competition_class = 'exhibition'),
    (select count(*) from public.gameplay_active_games a join public.games g on g.id = a.game_id where g.competition_class = 'exhibition'),
    (select count(*) from public.games where competition_class = 'official')
$$;
revoke all on function public.gameplay_exhibition_cleanup_preview() from public;

-- Owner-only. Needs the exact phrase and the exhibition-game count the preview
-- returned, so it deletes exactly what was previewed or nothing. Never touches
-- official games (and so never official statistics), accounts, card ownership,
-- rosters, line-ups or rest state.
create or replace function public.gameplay_exhibition_cleanup_execute(p_confirmation text, p_expected_exhibition_games bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  if p_confirmation is distinct from 'Delete all exhibition games' then
    raise exception 'Confirmation phrase does not match.';
  end if;
  select count(*) into v_count from public.games where competition_class = 'exhibition';
  if v_count <> p_expected_exhibition_games then
    raise exception 'Expected % exhibition games, found %: re-run the preview.', p_expected_exhibition_games, v_count;
  end if;
  delete from public.games where competition_class = 'exhibition';
  return v_count;
end;
$$;
revoke all on function public.gameplay_exhibition_cleanup_execute(text, bigint) from public;
-- Owner only (the SQL Editor): no app role and not the service role.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.gameplay_exhibition_cleanup_preview() from %I', r);
      execute format('revoke all on function public.gameplay_exhibition_cleanup_execute(text, bigint) from %I', r);
    end if;
  end loop;
end;
$$;

commit;
