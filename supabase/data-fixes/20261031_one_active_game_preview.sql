-- Elements Baseball — Stage 3 preview (READ-ONLY). Run in the Supabase SQL
-- Editor BEFORE supabase/migrations/20261031_gameplay_one_active_game.sql.
-- It changes nothing: two SELECTs.
--
-- 1. Every unfinished game and what the migration will do to it:
--      CLOSE           -- on the migration's list of 14; becomes `terminated`
--      LEAVE (test)    -- one-screen game NOT on the list (created after the
--                         inventory); exempt from the limit, left open
--      LEAVE (active)  -- two-player game NOT on the list; stays open and is registered
--    Expect exactly 14 CLOSE rows and nothing else. Anything else: stop and say so.
-- 2. Managers who would still be in more than one unfinished two-player game
--    after the cleanup. Must return NO rows, or the migration refuses to run.
--
-- STATUS: written 2026-10-31; tested against a real Postgres by
-- oneActiveGameSql.test.ts. RUN live 2026-10-31 before the migration: 14 CLOSE
-- of 14 unfinished, 0 conflicts.

-- The migration's practice list -- keep identical to section 5 of the migration.
with listed(id) as (values
  ('d7a84ae8-8702-485c-8b99-60503b6ca7d8'::uuid),
  ('9faac0a3-9a67-4b0e-9b40-b53028e99c5d'),
  ('a96cc687-4f0e-4d8e-b8b7-961a09e3499c'),
  ('7c0dd0a3-41f2-41a7-a07f-ce92c1a2057e'),
  ('6883c8ea-4ed3-4bd3-a597-c72da823f845'),
  ('adba4077-3b9e-445d-9a68-cafd54e71b70'),
  ('794058a4-806f-410e-8ad4-464e915c52f4'),
  ('a3c8f3a2-a172-4102-8058-79063140623f'),
  ('bee9a8b1-beed-4352-b7c1-774ae2bce27d'),
  ('9edee9f1-b3f2-4157-bf36-df4544456d2f'),
  ('a906e567-a2c0-4048-8e3a-e5cedfb08d51'),
  ('6a1b94ed-40bf-45de-a2fb-31b30b214f4a'),
  ('1ed608fb-febb-4c4c-8129-c57751ae9708'),
  ('0c37ba41-42a4-41e8-9f12-605398d7d6ec')
),
unfinished as (
  select g.*, coalesce((g.game_state->>'turnHandshake')::boolean, false) as two_player
  from public.games g
  where g.status not in ('complete', 'cancelled', 'terminated')
)
select
  case when u.id in (select id from listed) then 'CLOSE'
       when not u.two_player then 'LEAVE (test)'
       else 'LEAVE (active)' end as action,
  u.id, u.status,
  case when u.two_player then 'two-player' else 'one-screen test' end as game_type,
  h.manager_name as home, a.manager_name as away,
  u.created_at, u.updated_at,
  (select count(*) from public.game_events e where e.game_id = u.id) as saved_events
from unfinished u
left join public.profiles h on h.user_id = u.home_user_id
left join public.profiles a on a.user_id = u.away_user_id
order by action, u.created_at;

-- Conflicts the migration would refuse to run with (expect no rows).
with listed(id) as (values
  ('d7a84ae8-8702-485c-8b99-60503b6ca7d8'::uuid),
  ('9faac0a3-9a67-4b0e-9b40-b53028e99c5d'),
  ('a96cc687-4f0e-4d8e-b8b7-961a09e3499c'),
  ('7c0dd0a3-41f2-41a7-a07f-ce92c1a2057e'),
  ('6883c8ea-4ed3-4bd3-a597-c72da823f845'),
  ('adba4077-3b9e-445d-9a68-cafd54e71b70'),
  ('794058a4-806f-410e-8ad4-464e915c52f4'),
  ('a3c8f3a2-a172-4102-8058-79063140623f'),
  ('bee9a8b1-beed-4352-b7c1-774ae2bce27d'),
  ('9edee9f1-b3f2-4157-bf36-df4544456d2f'),
  ('a906e567-a2c0-4048-8e3a-e5cedfb08d51'),
  ('6a1b94ed-40bf-45de-a2fb-31b30b214f4a'),
  ('1ed608fb-febb-4c4c-8129-c57751ae9708'),
  ('0c37ba41-42a4-41e8-9f12-605398d7d6ec')
),
remaining as (
  select id, home_user_id, away_user_id from public.games
  where status not in ('complete', 'cancelled', 'terminated')
    and coalesce((game_state->>'turnHandshake')::boolean, false)
    and id not in (select id from listed)
),
seats as (
  select home_user_id as user_id, id from remaining
  union all
  select away_user_id, id from remaining
)
select p.manager_name, s.user_id, count(*) as unfinished_two_player_games, string_agg(s.id::text, ', ') as game_ids
from seats s left join public.profiles p on p.user_id = s.user_id
group by p.manager_name, s.user_id
having count(*) > 1;
