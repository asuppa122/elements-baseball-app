-- Elements Baseball v1.3.72 — gameplay roster readiness for the private playable shell.
-- Run after 20260818_gameplay_phase1a_private_lab.sql.
--
-- This does NOT broaden lineup RLS. It exposes only the currently active lineup
-- to allowlisted gameplay-lab testers so the Games hub can validate whether a
-- manager is actually eligible for the active gameplay configuration.

create or replace function public.list_gameplay_active_rosters()
returns table (
  user_id uuid,
  manager_name text,
  avatar_url text,
  lineup_id uuid,
  lineup_name text,
  use_dh boolean,
  player_count integer,
  total_points integer,
  roster_state jsonb,
  updated_at timestamptz
)
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
  select
    p.user_id,
    p.manager_name,
    p.avatar_url,
    l.id,
    l.name,
    l.use_dh,
    l.player_count,
    l.total_points,
    l.roster_state,
    l.updated_at
  from public.profiles p
  left join public.lineups l
    on l.user_id = p.user_id
   and l.is_active = true
  order by p.manager_name;
end;
$$;

grant execute on function public.list_gameplay_active_rosters() to authenticated;

comment on function public.list_gameplay_active_rosters() is
  'Private gameplay-lab helper that exposes each claimed manager active lineup for active-season eligibility validation.';
