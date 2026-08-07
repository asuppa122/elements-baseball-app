# Elements Baseball setup — tonight

1. Open Supabase → SQL Editor.
2. Run the Supabase migrations in order:
   - `supabase/migrations/20260801_auth_managers_lineups.sql`
   - `supabase/migrations/20260802_phase1_auth_hardening.sql`
   - `supabase/migrations/20260807_discord_claim_username_compat.sql`
3. Confirm Discord remains enabled under Authentication → Providers.
4. Restart the local app after replacing the project folder.
5. Log out and log back in with Discord.
6. Claim the correct manager account.
7. Open Cards and confirm ownership badges match that manager.
8. Open Lineup Builder and create/open a lineup.

The migration preloads:
Anthony, Ben, Chuck, Eric, James, Jeremiah, John, Matt, Nate, Ryan, Will, and Zeek.
James is marked as the initial admin when he claims the James manager account.
