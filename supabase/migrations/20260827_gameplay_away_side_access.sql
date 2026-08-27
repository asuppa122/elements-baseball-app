-- Lifts Phase 1A's original, deliberate two-sided access restriction
-- (20260818_gameplay_phase1a_private_lab.sql: "Opponents are referenced for
-- test records but cannot see or interact with the game yet"). Confirmed
-- live via pg_policies before writing this: both existing SELECT policies on
-- games and game_events check home_user_id = auth.uid() only -- there is no
-- away-scoped SELECT policy at all today, so the away-side manager cannot
-- read the game or its events under any circumstances, even once
-- allowlisted. This is the real blocker found during the rule-engine trust
-- audit, more fundamental than "no turn authorization" or "no realtime
-- sync" -- those assume both sides can at least see the game.

-- 1) Grant a second manager real gameplay lab access, mirroring the
--    Anthony seed in the Phase 1A migration exactly.
insert into public.gameplay_feature_access (user_id, access_mode)
select user_id, 'sandbox'
from public.profiles
where manager_name = 'Will'
on conflict (user_id) do nothing;

-- 2) Away-scoped SELECT policy on games, mirroring the existing home-scoped
--    policy from Phase 1A exactly except for which side of the game it
--    checks. Both policies coexist (Postgres RLS policies are OR'd together
--    for the same command), so home and away can each read the game via
--    their own login without weakening the existing home-side policy at
--    all.
create policy "Gameplay lab testers can view their test games as away"
on public.games for select
to authenticated
using (
  public.has_gameplay_lab_access()
  and away_user_id = (select auth.uid())
);

-- 3) Same mirroring for game_events -- the existing policy joins to games
--    and checks home_user_id; this adds the away_user_id equivalent.
create policy "Gameplay lab testers can view their test game events as away"
on public.game_events for select
to authenticated
using (
  public.has_gameplay_lab_access()
  and exists (
    select 1
    from public.games g
    where g.id = game_id
      and g.away_user_id = (select auth.uid())
  )
);

-- Deliberately NOT touched: the games INSERT policy stays home-only (a game
-- is still only ever created by the home side choosing an opponent, per
-- Phase 1A's create_gameplay_lab_game flow) -- this migration is about
-- reading an already-created game as the away side, not creating one as
-- away. Also deliberately not touched: all writes to games/game_events
-- still only ever happen through the security-definer
-- save_gameplay_lab_state RPC, which already bypasses per-row ownership
-- checks for both sides -- this migration only affects direct SELECT reads.
