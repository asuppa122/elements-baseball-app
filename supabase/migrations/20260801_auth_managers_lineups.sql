-- Elements Baseball: authenticated managers and saved lineups
-- Run this entire file once in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.elements_managers (
  id bigint generated always as identity primary key,
  manager_name text not null unique,
  expected_discord_username text unique,
  claimed_by_user_id uuid unique references auth.users(id) on delete set null,
  discord_id text unique,
  discord_username text,
  discord_display_name text,
  avatar_url text,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  manager_id bigint not null unique references public.elements_managers(id) on delete restrict,
  manager_name text not null unique,
  discord_id text unique,
  discord_username text,
  discord_display_name text,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lineups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'New Lineup',
  is_active boolean not null default false,
  sort_order integer not null default 0,
  use_dh boolean not null default true,
  player_count integer not null default 0,
  total_points integer not null default 0,
  roster_state jsonb not null default '{"assigned":{},"rosterFormat":"full","useDh":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sort_order)
);

create unique index if not exists one_active_lineup_per_user
  on public.lineups(user_id)
  where is_active;

insert into public.elements_managers (manager_name, expected_discord_username)
values
  ('Anthony', 'suppastar122'),
  ('Ben', 'bentherocker2355'),
  ('Chuck', 'jolly_tom'),
  ('Eric', 'atlboyz'),
  ('James', 'boldmane'),
  ('Jeremiah', 'ozzmandiaas2_57470'),
  ('John', 'jflocas2400'),
  ('Matt', 'mp0797mp'),
  ('Nate', 'sasshampoo'),
  ('Ryan', 'papagrumps_'),
  ('Will', 'WPHIII'),
  ('Zeek', 'grumpyzeek')
on conflict (manager_name) do update
set expected_discord_username = excluded.expected_discord_username;

alter table public.elements_managers enable row level security;
alter table public.profiles enable row level security;
alter table public.lineups enable row level security;

drop policy if exists "Authenticated users can view available managers" on public.elements_managers;
create policy "Authenticated users can view available managers"
on public.elements_managers for select
to authenticated
using (claimed_by_user_id is null or claimed_by_user_id = (select auth.uid()));

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
on public.profiles for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users can view their own lineups" on public.lineups;
create policy "Users can view their own lineups"
on public.lineups for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can create their own lineups" on public.lineups;
create policy "Users can create their own lineups"
on public.lineups for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own lineups" on public.lineups;
create policy "Users can update their own lineups"
on public.lineups for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own lineups" on public.lineups;
create policy "Users can delete their own lineups"
on public.lineups for delete
to authenticated
using (user_id = (select auth.uid()));

create or replace function public.claim_elements_manager(
  manager_record_id bigint,
  discord_account_id text,
  discord_username_value text,
  discord_display_name_value text,
  avatar_url_value text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  manager_record public.elements_managers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in.';
  end if;

  if exists(select 1 from public.profiles where user_id = auth.uid()) then
    raise exception 'This Discord account has already claimed a manager.';
  end if;

  select * into manager_record
  from public.elements_managers
  where id = manager_record_id
  for update;

  if not found then
    raise exception 'Manager was not found.';
  end if;

  if manager_record.claimed_by_user_id is not null then
    raise exception 'That manager has already been claimed.';
  end if;

  if lower(trim(coalesce(manager_record.expected_discord_username, ''))) <>
     lower(trim(coalesce(discord_username_value, ''))) then
    raise exception 'This manager is assigned to a different Discord account.';
  end if;

  update public.elements_managers
  set
    claimed_by_user_id = auth.uid(),
    discord_id = discord_account_id,
    discord_username = discord_username_value,
    discord_display_name = discord_display_name_value,
    avatar_url = avatar_url_value,
    claimed_at = now()
  where id = manager_record_id;

  insert into public.profiles (
    user_id,
    manager_id,
    manager_name,
    discord_id,
    discord_username,
    discord_display_name,
    avatar_url,
    is_admin
  ) values (
    auth.uid(),
    manager_record.id,
    manager_record.manager_name,
    discord_account_id,
    discord_username_value,
    discord_display_name_value,
    avatar_url_value,
    manager_record.manager_name = 'James'
  );
end;
$$;

grant execute on function public.claim_elements_manager(bigint, text, text, text, text) to authenticated;

create or replace function public.enforce_three_lineups()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.lineups where user_id = new.user_id) >= 3 then
    raise exception 'A manager may save no more than three lineups.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_three_lineups_trigger on public.lineups;
create trigger enforce_three_lineups_trigger
before insert on public.lineups
for each row execute function public.enforce_three_lineups();

create or replace function public.set_active_lineup(lineup_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be logged in.';
  end if;

  if not exists(
    select 1 from public.lineups
    where id = lineup_record_id and user_id = auth.uid()
  ) then
    raise exception 'Lineup not found.';
  end if;

  update public.lineups
  set is_active = false, updated_at = now()
  where user_id = auth.uid() and is_active;

  update public.lineups
  set is_active = true, updated_at = now()
  where id = lineup_record_id and user_id = auth.uid();
end;
$$;

grant execute on function public.set_active_lineup(uuid) to authenticated;
