Elements Baseball
Version: v1.3.81

Date
August 24, 2026 (README last checked against CHANGELOG.md: August 25, 2026)

Stable Features
---------------
✓ Discord Login
✓ Guest Demo
✓ Cards Database
✓ Team Builder
✓ Active Roster
✓ Fielding
✓ Batting Order
✓ Bench
✓ Rotation
✓ Bullpen
✓ Home Dashboard
✓ Mobile Responsive
✓ Save Teams
✓ Roster Swapping
✓ Clear Page
✓ Clear Team
✓ Rulebook (full digital rulebook, search, quick rules, rules demos)
✓ Standings (current season + all-time)
✓ Season Milestones
✓ Cloudflare R2 image hosting (WebP grid/thumbnail variants, migrated off Supabase Storage)

Not yet public
---------------
- Play / head-to-head games -- still shows "Coming Soon" in the public app. The underlying gameplay engine (pitch-by-pitch rule resolution, manager decisions, full Rulebook coverage) is built and under active internal testing at a private, unlinked route, but is not exposed to managers yet.
- Statistics, Trades -- "Coming Soon" placeholders, not built.

Roadmap
-------
Phase 2
- Home tile styling
- Theme selector (Light/Dark)
- Create Team wizard
- File/code cleanup
- Restore ESLint (no working lint config currently exists)
- Break the public "Play" gate open once the private gameplay engine is ready for managers

Phase 3
- Generated fallback cards (for the small number of published cards with no working image)
- Further performance improvements (route-level code-splitting; the app currently ships as one bundle)

Notes
-----
See CHANGELOG.md for the detailed, version-by-version history -- this file only tracks the high-level feature checklist and should be kept in sync with it, not maintained independently.