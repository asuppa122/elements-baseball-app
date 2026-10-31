-- Elements Baseball — one-time data correction: rest rows written by the
-- first live two-player game (Anthony vs. Will, final 8–4, game
-- 5f851eed-a521-4b96-9dba-446ea0b2a506) under the old postgame rule.
--
-- WHY: that game completed on 2026-10-29, before
-- 20261030_gameplay_rest_appearance_fix.sql. The old rule subtracted the
-- day's -1 from players who APPEARED as well as those who sat, so every
-- appearing player was left one game short (Rube Curry: 2, should be 3).
-- This adds that 1 back, and only that.
--
-- HOW TO RUN (Supabase SQL Editor): run STEP 1 alone first and read the rows.
-- Then run STEP 2 alone. STEP 2 is safe to run twice: it only touches rows
-- still exactly as that game left them (updated_at = the game's
-- completed_at, which the completion wrote in the same transaction); any
-- later game, or this fix itself, changes updated_at and the row is skipped.
--
-- WHEN 1 IS ADDED BACK, and when not: with x = prior + card fatigue and b the
-- milestone bonus that game, the old value was max(0, x-1-b) and the right
-- one max(0, x-b). They differ by exactly 1 when the saved value is above 0,
-- or when b = 0 and the card has fatigue >= 1. Otherwise (a 0 on a
-- milestone game, or a fatigue-0 card at 0) the difference cannot be told
-- from what is stored, so the row is listed and left alone.
--
-- STATUS: written 2026-10-30, tested against a real Postgres by
-- src/gameplay/__tests__/restCorrectionSql.test.ts. NOT run yet.
-- SUPERSEDED 2026-10-31 -- DO NOT RUN. Nothing played before launch counts,
-- so these rows are archived instead, untouched:
-- supabase/data-fixes/20261031_prelaunch_rest_archive.sql.

-- ===================== STEP 1: preview (read-only) =====================
with g as (
  select id, season_id, home_user_id, away_user_id, completed_at, game_state as s
  from public.games
  where id = '5f851eed-a521-4b96-9dba-446ea0b2a506' and status = 'complete'
),
sides as (
  select g.*, v.side, case v.side when 'home' then g.home_user_id else g.away_user_id end as user_id
  from g cross join (values ('home'), ('away')) as v(side)
),
bonus as (
  select sd.side,
    coalesce(sum((m->>'bonusRestDays')::int) filter (
      where (m->>'gamesPlayed')::int > 0 and n.cnt % (m->>'gamesPlayed')::int = 0), 0) as b
  from sides sd
  cross join lateral (
    select count(*) as cnt from public.games o
    where o.status = 'complete' and o.season_id = sd.season_id
      and (o.home_user_id = sd.user_id or o.away_user_id = sd.user_id)
      and o.completed_at <= sd.completed_at
  ) n
  left join lateral jsonb_array_elements(coalesce(sd.s->'configuration'->'restMilestones', '[]'::jsonb)) m on true
  group by sd.side
),
appeared as (
  select sd.user_id, sd.season_id, sd.side, sd.completed_at, 'hitter' as track, k as card_key,
    (sd.s->'pregame'->sd.side->'roster'->'cards'->k->'hitter'->>'fatigue')::int as fatigue
  from sides sd, jsonb_array_elements_text(coalesce(sd.s->'hitterPlateAppearanceCardKeys'->sd.side, '[]'::jsonb)) k
  where not (coalesce(sd.s->'pregame'->sd.side->'defaultBatterCardKeys', '[]'::jsonb) ? k)
  union all
  select sd.user_id, sd.season_id, sd.side, sd.completed_at, 'pitcher', k,
    (sd.s->'pregame'->sd.side->'roster'->'cards'->k->'pitcher'->>'fatigue')::int
  from sides sd, jsonb_array_elements_text(coalesce(sd.s->'pitcherAppearanceCardKeys'->sd.side, '[]'::jsonb)) k
  where not (coalesce(sd.s->'pregame'->sd.side->'defaultPitcherCardKeys', '[]'::jsonb) ? k)
),
decided as (
  select a.user_id, a.side, a.track, a.card_key, a.fatigue, b.b as milestone_bonus,
    case a.track when 'hitter' then r.hitter_games_remaining else r.pitcher_games_remaining end as current_value,
    case
      when r.user_id is null then 'skip: no rest row'
      when r.updated_at <> a.completed_at then 'skip: row changed since that game (later game or already fixed)'
      when (case a.track when 'hitter' then r.hitter_games_remaining else r.pitcher_games_remaining end) > 0 then 'add 1'
      when b.b = 0 and coalesce(a.fatigue, 0) >= 1 then 'add 1'
      else 'skip: saved 0 on a milestone game or fatigue-0 card, cannot tell'
    end as action
  from appeared a
  join bonus b on b.side = a.side
  left join public.player_rest_state r
    on r.user_id = a.user_id and r.season_id = a.season_id and r.card_key = a.card_key
)
select p.manager_name as manager, d.side, d.track, d.card_key as player, d.fatigue as card_fatigue,
  d.current_value as current_games_from_rested,
  case when d.action = 'add 1' then d.current_value + 1 else d.current_value end as corrected_games_from_rested,
  d.action
from decided d
left join public.profiles p on p.user_id = d.user_id
order by d.side, d.track, d.card_key;

-- ===================== STEP 2: apply =====================
with g as (
  select id, season_id, home_user_id, away_user_id, completed_at, game_state as s
  from public.games
  where id = '5f851eed-a521-4b96-9dba-446ea0b2a506' and status = 'complete'
),
sides as (
  select g.*, v.side, case v.side when 'home' then g.home_user_id else g.away_user_id end as user_id
  from g cross join (values ('home'), ('away')) as v(side)
),
bonus as (
  select sd.side,
    coalesce(sum((m->>'bonusRestDays')::int) filter (
      where (m->>'gamesPlayed')::int > 0 and n.cnt % (m->>'gamesPlayed')::int = 0), 0) as b
  from sides sd
  cross join lateral (
    select count(*) as cnt from public.games o
    where o.status = 'complete' and o.season_id = sd.season_id
      and (o.home_user_id = sd.user_id or o.away_user_id = sd.user_id)
      and o.completed_at <= sd.completed_at
  ) n
  left join lateral jsonb_array_elements(coalesce(sd.s->'configuration'->'restMilestones', '[]'::jsonb)) m on true
  group by sd.side
),
appeared as (
  select sd.user_id, sd.season_id, sd.side, sd.completed_at, 'hitter' as track, k as card_key,
    (sd.s->'pregame'->sd.side->'roster'->'cards'->k->'hitter'->>'fatigue')::int as fatigue
  from sides sd, jsonb_array_elements_text(coalesce(sd.s->'hitterPlateAppearanceCardKeys'->sd.side, '[]'::jsonb)) k
  where not (coalesce(sd.s->'pregame'->sd.side->'defaultBatterCardKeys', '[]'::jsonb) ? k)
  union all
  select sd.user_id, sd.season_id, sd.side, sd.completed_at, 'pitcher', k,
    (sd.s->'pregame'->sd.side->'roster'->'cards'->k->'pitcher'->>'fatigue')::int
  from sides sd, jsonb_array_elements_text(coalesce(sd.s->'pitcherAppearanceCardKeys'->sd.side, '[]'::jsonb)) k
  where not (coalesce(sd.s->'pregame'->sd.side->'defaultPitcherCardKeys', '[]'::jsonb) ? k)
),
decided as (
  select a.user_id, a.season_id, a.side, a.track, a.card_key, a.fatigue, b.b as milestone_bonus,
    case a.track when 'hitter' then r.hitter_games_remaining else r.pitcher_games_remaining end as current_value,
    case
      when r.user_id is null then 'skip: no rest row'
      when r.updated_at <> a.completed_at then 'skip: row changed since that game (later game or already fixed)'
      when (case a.track when 'hitter' then r.hitter_games_remaining else r.pitcher_games_remaining end) > 0 then 'add 1'
      when b.b = 0 and coalesce(a.fatigue, 0) >= 1 then 'add 1'
      else 'skip: saved 0 on a milestone game or fatigue-0 card, cannot tell'
    end as action
  from appeared a
  join bonus b on b.side = a.side
  left join public.player_rest_state r
    on r.user_id = a.user_id and r.season_id = a.season_id and r.card_key = a.card_key
),
fix as (
  select user_id, season_id, card_key,
    bool_or(track = 'hitter') as add_hitter,
    bool_or(track = 'pitcher') as add_pitcher
  from decided
  where action = 'add 1'
  group by user_id, season_id, card_key
)
update public.player_rest_state r
set hitter_games_remaining = r.hitter_games_remaining + case when f.add_hitter then 1 else 0 end,
    pitcher_games_remaining = r.pitcher_games_remaining + case when f.add_pitcher then 1 else 0 end,
    updated_at = now()
from fix f
where r.user_id = f.user_id and r.season_id = f.season_id and r.card_key = f.card_key
returning r.card_key, r.hitter_games_remaining, r.pitcher_games_remaining;
