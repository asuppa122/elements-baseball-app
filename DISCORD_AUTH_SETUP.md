# Discord login setup

The app-side Discord login is included in this build. Complete these dashboard steps before testing it.

## 1. Create a Discord application

1. Open the Discord Developer Portal.
2. Create a new application for Elements Baseball.
3. Open **OAuth2** and copy the Client ID and Client Secret.

## 2. Configure Discord in Supabase

1. Open the Supabase project.
2. Go to **Authentication → Providers → Discord**.
3. Enable Discord.
4. Paste the Discord Client ID and Client Secret.
5. Copy the Supabase callback URL shown in the Discord provider settings.
6. Add that callback URL to the Discord application's OAuth2 redirect URLs.

## 3. Configure Supabase redirect URLs

In **Authentication → URL Configuration**:

- Set the production Site URL to the Vercel URL.
- Add these Redirect URLs:
  - `http://localhost:5173/auth/callback`
  - `http://localhost:5174/auth/callback`
  - `https://YOUR-VERCEL-DOMAIN.vercel.app/auth/callback`

Add any Vercel custom domain callback as well.

## 4. Run the profile migration

Run this file in the Supabase SQL Editor:

`supabase/migrations/202608020001_discord_auth_profiles.sql`

It creates one protected manager profile per authenticated Discord account.

## 5. Vercel environment variables

Add these to the Vercel project and redeploy:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Use the same values already present in the local `.env` file.

## 6. Test locally

```bash
npm install
npm run build
npm run dev
```

Open the local URL, choose **Lineup Builder**, and log in with Discord. The Lineup Builder route is now protected; the public Cards pages remain accessible without login.

## What this build intentionally does not change

- The finished Defense screen
- Overview, Batting Order, Bench, Rotation, or Bullpen
- Current lineup persistence
- Card ownership storage

The next update will create the user-owned Supabase lineup tables and the maximum-three lineup selector after Discord login is confirmed working.
