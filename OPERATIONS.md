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
