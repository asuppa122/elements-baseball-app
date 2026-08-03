# Cleanup Audit — 2026-08-03

Removed from the handoff package because they are not required by the running app:

- accumulated one-off update/QA Markdown notes
- generated inventory and knip report files
- the large local `json.txt` import source file (gitignored; preserve separately if still needed for imports)
- `.env` credentials (preserve your existing local `.env`; `.env.example` is included)
- unused starter assets (`react.svg`, `vite.svg`, `hero.png`)
- unused public assets (`icons.svg`, `elements-squad-field.svg`)

Retained:

- active React/TypeScript source
- shared production and Demo Mode routes/layouts
- current field image and logo/favicon
- Supabase migrations
- card import scripts
- Vercel configuration

Runtime image performance remains primarily dependent on remote image size, hosting, caching, thumbnails, and lazy loading. The planned Cloudflare R2 migration remains the major performance phase.

## Final feedback fixes included
- Removed redundant ownership and season-eligible summary chips while retaining their toggles.
- Kept Current and Substitute cards vertically aligned when a preview is selected.
- Changed user-facing Defense section labels to Fielding for navigation consistency.
- Includes the responsive horizontal Current → Substitute → Collection workspace in production and Demo Mode.
