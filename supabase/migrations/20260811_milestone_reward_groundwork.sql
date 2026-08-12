-- Elements Baseball milestone reward / Prize Pack groundwork
--
-- This migration creates storage only. It intentionally exposes NO authenticated
-- INSERT/UPDATE/DELETE policy and no claim RPC. Rewards cannot be claimed through
-- the client until a later approved migration adds server-side eligibility checks.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'milestone_reward_claim_status') then
    create type public.milestone_reward_claim_status as enum (
      'reserved',
      'revealed',
      'granted',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.milestone_reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  manager_id bigint not null references public.elements_managers(id) on delete restrict,
  season_key text not null,
  category text not null check (category in ('standard','consistency','ladder','community')),
  phase text,
  milestone_key text not null,
  reward_definition jsonb not null,
  status public.milestone_reward_claim_status not null default 'reserved',
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  revealed_at timestamptz,
  granted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (manager_id, season_key, category, phase, milestone_key)
);

create table if not exists public.milestone_reward_items (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.milestone_reward_claims(id) on delete cascade,
  reveal_order integer not null check (reveal_order >= 0),
  item_type text not null default 'card' check (item_type in ('card')),
  card_key text,
  item_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (claim_id, reveal_order)
);

create index if not exists milestone_reward_claims_user_idx
  on public.milestone_reward_claims(user_id, created_at desc);
create index if not exists milestone_reward_items_claim_idx
  on public.milestone_reward_items(claim_id, reveal_order);

alter table public.milestone_reward_claims enable row level security;
alter table public.milestone_reward_items enable row level security;

-- Read-only owner visibility is safe for future UI status display.
drop policy if exists "Users can view their own milestone reward claims" on public.milestone_reward_claims;
create policy "Users can view their own milestone reward claims"
on public.milestone_reward_claims for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can view their own milestone reward items" on public.milestone_reward_items;
create policy "Users can view their own milestone reward items"
on public.milestone_reward_items for select
to authenticated
using (exists (
  select 1
  from public.milestone_reward_claims claim
  where claim.id = milestone_reward_items.claim_id
    and claim.user_id = (select auth.uid())
));

-- Deliberately no authenticated write policies and no claim/grant RPC yet.
-- The future server-side claim flow should perform, in one transaction:
--   1. verify milestone eligibility from an authoritative progress source
--   2. reserve the unique claim / idempotency key
--   3. generate and persist Prize Pack contents exactly once
--   4. reveal the persisted contents (never reroll on refresh)
--   5. grant the persisted items to the manager collection exactly once
--   6. mark the claim granted
