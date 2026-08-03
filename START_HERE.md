# Elements Baseball — Complete Update Package

This package is designed to be used as one complete handoff. You do **not** need to manually save and restore separate project pieces.

## Easiest update method on Mac

1. Extract this ZIP.
2. Open the extracted folder.
3. Double-click `APPLY_UPDATE.command`.
4. The script updates `~/Desktop/elements-baseball-app` while automatically preserving:
   - `.env`
   - `.git`
   - `node_modules`
   - `json.txt`
5. When it finishes, double-click `RUN_LOCAL.command` to test locally.
6. Once testing passes, double-click `PUSH_LIVE.command` to deploy through GitHub/Vercel.

The production app and `/demo` are part of the same Vercel project, so one Git push updates both.

## URLs

Local app: the Vite URL shown in Terminal, usually `http://localhost:5173` or `http://localhost:5174`

Local demo: add `/demo` to the Vite URL.

Live league app: `https://elements-baseball.vercel.app`

Live public demo: `https://elements-baseball.vercel.app/demo`

## Required final checks

- Normal Discord login still works.
- Manager ownership remains attached correctly.
- Team saving works in the league app.
- Demo Mode does not persist changes.
- Current and Substitute remain aligned after choosing a card.
- Active Roster section says `FIELDING`.
- Ownership and Season Eligible are not shown twice.
- Desktop and mobile layouts both work.

## Environment variables

The update script preserves your current `.env` automatically. An `.env.example` is included only as a reference. Real credentials are intentionally not embedded in a shared ZIP.
