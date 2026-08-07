-- Elements Baseball v1.3.1: Discord manager-claim compatibility fix
-- Run this entire file once in the Supabase SQL Editor.
--
-- Why:
-- Discord's username migration can produce handles with a trailing underscore +
-- digits (for example, name_12345). The original claim function required an
-- exact username match, which can reject the correct manager when the preloaded
-- roster contains the base username or an older variant.
--
-- This migration keeps the one-manager-per-Discord-account protections intact.
-- It only broadens username verification so an exact base username and the same
-- username with a Discord-style numeric suffix are treated as the same account.

-- Correct the Jeremiah seed typo from the original migration if it is present.
update public.elements_managers
set expected_discord_username = 'ozzmandias2_57470'
where manager_name = 'Jeremiah'
  and lower(trim(coalesce(expected_discord_username, ''))) in (
    'ozzmandiaas2_57470',
    'ozzmandias2_57470'
  );

create or replace function public.normalize_elements_discord_username(value text)
returns text
language sql
immutable
as $$
  select lower(
    regexp_replace(
      regexp_replace(trim(coalesce(value, '')), '#[0-9]{1,4}$', ''),
      '_[0-9]{4,6}$',
      ''
    )
  );
$$;

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

  normalized_discord_username := public.normalize_elements_discord_username(discord_username_value);

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

  if public.normalize_elements_discord_username(manager_record.expected_discord_username)
     <> normalized_discord_username then
    raise exception 'This manager is assigned to a different Discord account.';
  end if;

  if discord_account_id is null or trim(discord_account_id) = '' then
    raise exception 'Your Discord account ID could not be verified. Sign out and try again.';
  end if;

  if exists(
    select 1
    from public.elements_managers
    where discord_id = discord_account_id
       or public.normalize_elements_discord_username(discord_username) = normalized_discord_username
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
