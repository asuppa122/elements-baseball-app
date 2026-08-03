# Phase 1 Authentication Update

## Code changes

- Supabase authentication now explicitly uses browser local storage.
- Session persistence, automatic token refresh, and OAuth callback detection are explicitly enabled.
- Missing Supabase environment variables now produce a clear startup error.
- Added a Phase 1 database hardening migration.
- Manager claims are now enforced against the preloaded Discord username in the database, not only suggested in the interface.
- A Discord account cannot claim a second manager by reusing its Discord ID or username.
- Users can no longer directly edit manager identity fields in their profile.
- Lineup and profile `updated_at` timestamps are maintained by database triggers.

## Required Supabase step

Run this file once in the Supabase SQL Editor:

`supabase/migrations/20260802_phase1_auth_hardening.sql`

Run it after the original `20260801_auth_managers_lineups.sql` migration.

## Manual verification checklist

1. Sign in through Discord on the deployed Vercel site.
2. Confirm the correct manager is selected for the Discord username.
3. Confirm attempting to claim a different manager is rejected.
4. Save a lineup and note its name, DH setting, players, and points.
5. Close the browser completely, reopen the site, and confirm no login is required.
6. Confirm the saved lineup loads unchanged.
7. Sign out and confirm the login screen appears.
8. Sign back in and confirm the same manager and lineup return.
9. Test a second Discord account and confirm it cannot access the first account's lineup URL.
