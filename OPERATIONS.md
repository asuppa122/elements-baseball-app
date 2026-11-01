# Operations

Standing operational facts and open issues for the live project. Not launch
rules (those are in `LAUNCH_BLOCKERS.md`).

## Open issues

### Supabase billing: "Grace period is over" — ACTION NEEDED (found 2026-10-31)

The Supabase dashboard shows: *"Grace period is over. Your projects will not
be able to serve requests when you use up your quota."* The project is on the
**Free plan**. If a quota (database size, egress, monthly active users,
storage) is exceeded, the API stops serving requests — the site, sign-in and
gameplay would all fail, and so would `npm run snapshot:gameplay`.

To do: open Dashboard → Organization → Billing / Usage, see which quota is
over or close (the `cards` table alone is 135,203 rows and the full data
export is ~200 MB of JSON), and either reduce usage or move to the Pro plan.
Pro also adds daily database backups (see below), which this project does not
have today.

## Backups

### What exists

- **No Supabase backups.** The Free plan includes none (Dashboard → Database →
  Backups says so). There is no point-in-time recovery.
- **API data snapshots**, taken with `npm run snapshot:gameplay -- --all`
  (`scripts/snapshot-gameplay-tables.mjs`): every row of every public table,
  read through the Supabase data API with the service-role key, one JSON file
  per table, git-ignored under `backups/`.
  - Kept: `Stable Backups/supabase-data-snapshot-2026-10-31-pre-stage3.tar.gz`
    (taken just before the Stage 3 migration; README and SHA256SUMS inside;
    checksums verified after packing). The unpacked copy is in
    `Project/backups/full-2026-10-31T23-51-37-418Z`.

### What an API snapshot does NOT cover, compared with a PostgreSQL backup

A real backup (Supabase's own, or `pg_dump`) captures the database itself. The
API snapshot captures only the rows the data API can read in `public`:

| | API snapshot | `pg_dump` / Supabase backup |
|---|---|---|
| Rows of `public` tables | yes | yes |
| Table definitions, constraints, indexes | no — from the repo's migrations | yes |
| Functions, triggers, RLS policies, grants | no — from the repo's migrations | yes |
| Sequence positions (e.g. `game_events.id`) | no — must be reset after loading (`setval`) | yes |
| `auth` schema: accounts, identities, sessions | **no** | yes (Supabase backup); `pg_dump` with the right schemas |
| Storage buckets and files | no | no (files live outside Postgres) |
| Objects created outside migrations (dashboard edits) | no — and the repo may not have them either | yes |
| Consistency | table by table, a few seconds apart; a write during the run could land in one table and not another | one consistent point in time |
| Restore | load JSON into a schema rebuilt from migrations (`scripts/dry-run-rollout.mjs` shows how) | `psql` / Supabase restore |

So an API snapshot can restore the **data** of the tables it lists, into a
database rebuilt from this repo, but not the accounts, not anything created by
hand in the dashboard, and not with a guaranteed single point in time. It was
judged sufficient for the Stage 3 rollout because every table that rollout
changed was captured, the repo's migrations are the applied history (the live
writer's checksum was verified against the repo before applying), and the
restore was rehearsed.

### How to take a complete backup

Before any future migration that touches data beyond what an API snapshot can
restore, take a real one. The database password stays with Anthony — never
paste it into a chat or commit it.

1. Dashboard → **Connect** → copy the **Session pooler** connection string.
2. In your own terminal (Postgres 17 tools are installed via Homebrew):

   ```bash
   /opt/homebrew/opt/postgresql@17/bin/pg_dump "<connection string>" --no-owner --file="$HOME/Desktop/elements-baseball-app/Stable Backups/supabase-full-$(date +%F).sql"
   ```

   (Add `--schema=public` for just the app's tables; leave it off for
   everything the role can read, including `auth`.)
3. Check the file is several megabytes and starts with `-- PostgreSQL database dump`.

Or move to the Pro plan for daily backups with point-in-time options.

### Free-plan risks (as of 2026-11-01)

- **No backups, no point-in-time recovery.** A bad migration, a mistaken SQL
  statement or a compromised key could lose data with nothing but our own API
  snapshots to restore from.
- **API snapshots don't cover** accounts (`auth`), schema objects created
  outside migrations, storage files, or a single consistent moment (table
  above).
- **Quota enforcement.** With the grace period over, exceeding a Free-plan
  quota stops the API: site, sign-in, gameplay and the snapshot script all
  fail together.
- **Inactivity pausing.** Free projects can be paused after a period of
  inactivity (check Supabase's current policy); a paused project serves
  nothing until restored.

### Recommended backup approach (proposal — nothing changed)

Either option needs Anthony's decision; no service or billing change is made
without his approval.

**Option 1 — Pro plan:** daily automated backups (point-in-time recovery as a
paid add-on), no inactivity pausing, higher quotas. Simplest once official
data exists.

**Option 2 — stay on Free, with a `pg_dump` routine run by Anthony** (the
database password stays with him):

| When | What |
|---|---|
| Weekly while pre-launch | `pg_dump` of everything (command above) into `Stable Backups/`, plus `npm run snapshot:gameplay -- --all` |
| Before every migration or production data change | Both again, recorded in that change's rollout record |
| After launch | Daily `pg_dump` (scheduled in Anthony's own terminal or a launchd job on his Mac), keeping 14 daily + 8 weekly copies |
| Monthly | Copy the latest dump off this Mac (external drive or private cloud storage) |

### Restore testing (both options)

A backup is trusted only after a restore has been rehearsed:

1. Restore the latest dump into a throwaway local Postgres 17
   (`scripts/lib/localPostgres.mjs` already creates one), never Supabase.
2. Check row counts against the live inventory (`npm run inventory:games`,
   `npm run inventory:progression`) and run the server checks from the Stage 3
   rehearsal (`npm run check:rollout` pattern).
3. Record the date, dump file and result here.
4. Repeat monthly and before launch.

### Billing warning — action needed by Anthony

Dashboard → Organization → Billing / Usage: identify which quota is over or
close, then reduce usage or change plan. Unresolved as of 2026-11-01.


## Applying the 20261101 migration (when Anthony authorizes it)

`supabase/migrations/20261101_gameplay_stats_and_rest_v2.sql` is written and
tested on PGlite only. It adds columns with defaults, empty tables and
functions, and replaces `save_gameplay_lab_state` (byte-for-byte the 20261031
writer plus the rules-v2 rest adjustments). No existing row changes.

1. Deploy the matching app build first? **No** — apply the migration first or
   together: the old app ignores the new columns, and v2 games only exist once
   the new build creates them.
2. Take a fresh read-only snapshot (`npm run snapshot:gameplay`).
3. In the Supabase SQL Editor, paste the exact committed file text and run it
   once (it is one transaction; any failure changes nothing).
4. Verify: `select competition_class, count(*) from games group by 1` (all
   `exhibition` before launch); `select official_stats_writer_enabled from
   gameplay_settings` → false; `select * from gameplay_exhibition_cleanup_preview()`
   as the owner returns counts and deletes nothing.
5. Record it in `CHANGELOG.md` and a rollout note, like
   `supabase/ROLLOUT_STAGE3.md`.

Rollback: the additions are inert while tracking is off; re-running the
20261031 writer definition restores the previous writer exactly.

## Official statistics: how they would be switched on

Three independent gates, all OFF: official tracking
(`activate_official_tracking`, owner, typed phrase, clean slate), the writer
switch (`gameplay_settings.official_stats_writer_enabled`, owner), and the
writer function itself (`gameplay_write_official_stats`), callable only by the
owner or the service role — no app role. The trusted caller (to be built with
server-side move validation) computes the payload with
`src/gameplay/stats/officialPayload.ts` from the completed game's play log.
The function refuses exhibitions, incomplete games, a score that differs from
the saved game, and cards not on that side's roster, and replaces a game's
rows rather than adding to them.

## Exhibition cleanup (prepared, never run)

`select * from public.gameplay_exhibition_cleanup_preview();` (owner) shows
how many exhibition games and their events, rolls and registrations would go,
and how many official games stay. Deleting needs
`select public.gameplay_exhibition_cleanup_execute('Delete all exhibition games', <the previewed count>);`
— it refuses a stale count. It never touches official games, official
statistics, accounts, cards, rosters, line-ups or rest. Only with Anthony's
separate authorization, after a fresh snapshot.
