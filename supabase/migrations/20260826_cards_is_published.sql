-- Card published/unpublished visibility gate (CARD_PUBLISHED_STATUS_PLAN.md).
--
-- Column default is `false` (not `true`) so that any card inserted *after*
-- this migration -- e.g. a new card phantom-loaded into the DB by
-- import-cards.mjs ahead of its real stat release -- starts hidden by
-- default, matching the intended behavior described in
-- CARD_PUBLISHED_STATUS_PLAN.md (hidden until the workbook's Published
-- column reports YES for that card).
--
-- That default would retroactively hide every one of the ~13,457 cards that
-- already existed before this migration, which is real production data
-- currently visible to every user -- so this migration also does a one-time
-- backfill, in the same transaction, setting every pre-existing row to
-- `true`. Only cards inserted from this point forward ever start hidden.
--
-- No app-side or import-script change is required for the default/backfill
-- split to work correctly: import-cards.mjs's upsert payload
-- (scripts/import-cards.mjs) never includes `is_published`, so Postgres
-- applies the column default on INSERT for a brand-new card_key, and leaves
-- an existing row's `is_published` value completely untouched across every
-- routine re-import (the upsert's DO UPDATE SET clause only ever touches
-- columns actually present in the payload).

alter table public.cards
  add column is_published boolean not null default false;

-- One-time backfill: preserve current behavior for every card that already
-- existed before this column did.
update public.cards set is_published = true;

comment on column public.cards.is_published is
  'Gates card visibility in the app (src/services/cardDatabase.ts). New rows '
  'default to false (hidden) until the card-published-status import script '
  '(CARD_PUBLISHED_STATUS_PLAN.md) confirms the workbook''s per-manager '
  'Published column reports YES. Rows that already existed as of the '
  '2026-08-26 migration were backfilled to true in the same migration, so '
  'no previously-visible card became hidden by this change.';

create index if not exists cards_is_published_idx on public.cards (is_published);
