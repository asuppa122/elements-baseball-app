-- Elements Baseball Phase 1: authentication and manager-claim hardening
-- Run this entire file once in the Supabase SQL Editor after
-- 20260801_auth_managers_lineups.sql.

-- Profiles are identity records managed by the claim function. Users should be
-- able to read their own profile, but not rewrite manager identity fields.
drop policy if exists "Users can update their own profile" on public.profiles;

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
  normalized_discord_username text;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in.';
  end if;

  if exists(select 1 from public.profiles where user_id = auth.uid()) then
    raise exception 'This Discord account has already claimed a manager.';
  end if;

  normalized_discord_username := lower(trim(coalesce(discord_username_value, '')));

  if normalized_discord_username = '' then
    raise exception 'Your Discord username could not be verified. Sign out and try Discord login again.';
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

  if lower(trim(coalesce(manager_record.expected_discord_username, ''))) <> normalized_discord_username then
    raise exception 'This manager is assigned to a different Discord account.';
  end if;

  if discord_account_id is null or trim(discord_account_id) = '' then
    raise exception 'Your Discord account ID could not be verified. Sign out and try again.';
  end if;

  if exists(
    select 1
    from public.elements_managers
    where discord_id = discord_account_id
       or lower(trim(coalesce(discord_username, ''))) = normalized_discord_username
  ) then
    raise exception 'This Discord account has already claimed a manager.';
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

-- Keep lineup timestamps accurate even if a client forgets to send updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_lineups_updated_at on public.lineups;
create trigger set_lineups_updated_at
before update on public.lineups
for each row execute function public.set_updated_at();
