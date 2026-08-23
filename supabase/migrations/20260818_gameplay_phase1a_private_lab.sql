-- Elements Baseball Gameplay Phase 1A — private gameplay lab access
-- Run after 20260818_gameplay_phase1_foundation.sql.
--
-- This intentionally keeps the gameplay prototype private. Only users explicitly
-- allowlisted here can create/read lab games. Opponents are referenced for test
-- records but cannot see or interact with the game yet.

create table if not exists public.gameplay_feature_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_mode text not null default 'sandbox' check (access_mode in ('sandbox','private_test')),
  created_at timestamptz not null default now()
);

alter table public.gameplay_feature_access enable row level security;

-- Seed Anthony's already-claimed Elements profile as the first gameplay tester.
insert into public.gameplay_feature_access (user_id, access_mode)
select user_id, 'sandbox'
from public.profiles
where manager_name = 'Anthony'
on conflict (user_id) do nothing;

create or replace function public.has_gameplay_lab_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.gameplay_feature_access access
      where access.user_id = auth.uid()
    );
$$;

grant execute on function public.has_gameplay_lab_access() to authenticated;

create or replace function public.list_gameplay_lab_opponents()
returns table (
  user_id uuid,
  manager_name text,
  avatar_url text
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
    p.avatar_url
  from public.profiles p
  where p.user_id <> auth.uid()
  order by p.manager_name;
end;
$$;

grant execute on function public.list_gameplay_lab_opponents() to authenticated;

-- Replace the broad Phase 1 participant policies with lab-only policies for now.
drop policy if exists "Game participants can view games" on public.games;
drop policy if exists "Game participants can create games" on public.games;

create policy "Gameplay lab testers can view their test games"
on public.games for select
to authenticated
using (
  public.has_gameplay_lab_access()
  and home_user_id = (select auth.uid())
);

create policy "Gameplay lab testers can create private test games"
on public.games for insert
to authenticated
with check (
  public.has_gameplay_lab_access()
  and home_user_id = (select auth.uid())
  and home_user_id <> away_user_id
);

drop policy if exists "Game participants can view game events" on public.game_events;
create policy "Gameplay lab testers can view their test game events"
on public.game_events for select
to authenticated
using (
  public.has_gameplay_lab_access()
  and exists (
    select 1
    from public.games g
    where g.id = game_id
      and g.home_user_id = (select auth.uid())
  )
);

comment on table public.gameplay_feature_access is
  'Private allowlist for unreleased gameplay development. This is intentionally separate from general manager/admin permissions.';
