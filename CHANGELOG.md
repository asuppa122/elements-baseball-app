## v1.3.70 — Certification invariant trace instrumentation
- Adds a rolling state-transition trace only to failed Complete-Game Certification simulations.
- Captures inning/half, outs, batting-order cursor, batter card key, all three base identities/card keys, status/waiting state, and pending decision around the final transitions before an invariant failure.
- Does not change gameplay resolution, Rulebook logic, substitution behavior, batting-order advancement, or validation rules.
- Intended to isolate the remaining rare current-batter/active-baserunner corruption from deterministic seeds before making a gameplay fix.

## v1.3.68 — Certification runner identity correction
- Replaced broad batting-order substitution mapping with one-slot substitution and duplicate-active-player guards.
- Added certification invariants for duplicate batting-order identities and a current batter already occupying a base.
- Corrected inning-ending pre-pitch stolen-base outs so they end the half without advancing the batting-order cursor for a PA that never occurred.
- Keeps zero-bypass certification and all deterministic scenario matrices intact.

## v1.3.61 — Update 1 compile correction

## v1.3.63 — Update 2 DBP equality scenario correction
- Corrected the deterministic Standard DBP equality scenario so both fielding checks are true equality cases.
- Gameplay resolver unchanged: ordinary fielding checks are outs only when the fielding total is greater than BsR; equality remains safe.

- Removed an unused `tagUpRtsThreshold` import from `decisionEngine.ts` so the production TypeScript build passes with `noUnusedLocals`.
- No gameplay or Rulebook behavior changed from v1.3.60.


## v1.3.58 — Non-GB stress-test correction
- Applies Rulebook chartless defaults at the engine level: missing hitter On Base uses OB 5/default hitter chart; missing pitcher Control uses Control -5/default pitcher chart.
- Chartless handedness inherits the populated side of the card (Bats -> pitching arm; Arm -> batting side).
- Rules Bot now resumes and resolves valid `SWING_ROLL` handoffs returned by manager-decision branches.
- Manual pitch UI/logging now displays effective default OB/Control values instead of blanks.

## v1.3.57 — Build 2 Non-GB Decision Engine

- Completed the non-ground-ball decision framework for the private Gameplay Lab.
- Added pre-pitch manager actions for natural steals, intentional walks, sacrifice bunts, squeeze bunts, infield-in, pinch hitters, pinch runners, defensive substitutions, pitching changes, and no-DH double switches.
- Added mandatory 1B+ catcher-check resolution and natural-steal catcher/full-infield checks, including the one-attempt rule, negative-catcher exception, simultaneous steals, steal-home +15, and second-steal-of-home branch.
- Added sacrifice-bunt wheel-play and standard tables plus squeeze-bunt resolution.
- Corrected the two-out extra-base throw-home path so RTS is skipped entirely rather than rolled and ignored.
- Added locked Card Attributes / Default Attributes selection for replacement entries and default-pitcher chart/control support.
- Added infield-in pre-pitch declaration; non-GB PU/FB conversion is active while GB-specific infield-in outcomes remain intentionally reserved for the GB engine.
- Extended the Rules Bot so it can initiate and stress non-GB pre-pitch manager actions while Ground Ball Resolution remains the only major recurring development bypass.

# v1.3.56 — Build 2 Rules Bot / Decision Stress Test

- Adds a private, local-only 100-game Rules Bot stress test.
- Uses real Build 2 legal choices, Confirm transitions, RTS rolls, OF selection rotation and fielding resolver paths for implemented manager decisions.
- Counts unfinished Rulebook branches separately as development bypasses so later decision paths remain reachable during stress testing.
- Adds seeded failure reproduction and auditable RTS / outfield fielding math logs.
- Does not add a public game simulation feature and never writes bot simulations to Supabase.

## v1.3.54 — Build 2 Rulebook Resolver Compile Fix

- Fixed the v1.3.53 production TypeScript build errors without changing the approved Rulebook behavior.
- Removed an unused decision-selection import.
- Persist Rulebook d20 resolver actions through the existing `DECISION_RESOLVED` event contract with `resolutionKind: ROLL`, avoiding an unnecessary database migration/event-type fork.
- Corrected decision rendering so roll-only gateways render their Roll action directly instead of entering the selectable-option branch.

## v1.3.53 — Build 2 Rulebook Resolver
- Removed the redundant Review step: gameplay choices now use Select → Confirm → Next Action.
- Added authoritative d20 RTS resolution for optional extra bases and tag-ups.
- Added defensive throw-target and eligible outfielder selection, persisted LF/CF/RF usage rotation, and outfield fielding checks.
- Added the approved 1B → 2B tag-up rule: RTS 1-15 fails, 16+ continues, with +10 to the selected OF fielding check.
- Preserved base-path legality and authoritative persisted decision transitions.

# v1.3.52 — Build 2 Decision Engine Foundation

- Added shared manager-decision engine instead of page-specific decision buttons.
- Added Select → Review → Confirm → Locked interaction contract.
- Confirmed decisions persist as authoritative DECISION_RESOLVED events.
- Added multi-runner selection for optional extra-base and tag-up attempts.
- Enforced base-path legality in offered extra-base choices.
- Added defensive throw-target state for extra-base attempts.
- Added tag-up RTS handoff state matching the approved offense-selection → RTS sequence.
- Preserved Build 1 test harness behavior and existing game-state persistence.
- Left unresolved Rulebook roll/fielding resolvers explicit rather than inventing outcomes.

# v1.3.39 — Team Builder Automatic Two-Way Card Detection

- Replaced the manual two-way player-name allowlist with card-data detection.
- A card is now considered two-way only when it has both a usable hitter side (On Base + hitter chart result data) and a usable pitcher side (Control + IP + pitcher chart result data).
- Two-way cards may occupy one hitting/fielding assignment and one pitching assignment while counting once toward roster size and points.
- Fixes 1925 Harry Kenyon being incorrectly locked out of pitching assignments and automatically supports future two-way cards without name-specific code.

## v1.3.38 — Team Builder Two-Way Roster Fix
- True two-way cards can occupy one hitting/fielding role and one pitching role while counting once toward roster size and points.
- Added Luther Farrell to the recognized two-way player set.
- Removed the slot-based Bench + Bullpen cap that incorrectly blocked P5/P6; the unique-player roster limit remains authoritative.
- Preserves existing Team Builder assignments and gameplay Phase 1A groundwork.


## v1.3.35 — Diamond state surface + reward groundwork

- Milestone diamond is now the single state/action visual: `CLAIM REWARD` for completed/unclaimed milestones, current progress number for the active milestone, and `LOCKED` for future milestones.
- Removed the redundant inline claim-state pill from the Progress copy.
- Added an intentionally disabled milestone reward / Prize Pack TypeScript scaffold (`MILESTONE_REWARDS_ENABLED = false`).
- Added a Supabase groundwork migration for immutable/idempotent milestone reward claims and persisted reward reveal items.
- Reward tables have owner read policies only; there are deliberately no authenticated write policies or claim RPCs yet.
- Added `MILESTONE_REWARD_GROUNDWORK.md` documenting the eventual secure claim → reveal → grant lifecycle and the decisions still required before activation.
- No reward claiming, Prize Pack route, collection mutation, or new user-accessible functionality is enabled in this build.

# v1.3.26 — Rulebook Source-of-Truth Hierarchy

- Restored the website Rulebook outline to mirror the Google Doc's legal hierarchy: Roman numeral sections with A. / 1. / a) / (1) / (a) / (i) nesting.
- Section VII and VIII remain fully represented in the Table of Contents and reading view.
- Card-description blocks in Section III now behave as source-document subsections instead of being flattened into generic rule rows.
- Preserved the Rulebook wording and existing interactive search, Quick Rules, section navigation, and Simulated Demos separation.
- Refined chapter/subsection typography without changing unrelated app pages.

# v1.3.7 — Compact Attribute Row + Player Profile + Season Eligibility

- Condensed the Cards Attribute Filters builder into one horizontal desktop row.
- Reduced Player Profile header height and constrained the desktop profile to the viewport with internal content scrolling.
- Centralized Season Eligible logic across Cards and Team Builder.
- Current Elements season is 1925: every 1925 card is season eligible.
- Other-year cards are season eligible only when `source_yes_field` is `yes` or a recognized current manager name.
- Removed the stale 2025 current-season constant that caused 2025 cards to be treated as automatically eligible.

# v1.3.5 — Cards Picture 2 Filter Layout

- Reorganized the Cards controls to match the approved Picture 2 structure: Filters, Stat Type, Quick Sort, and Sort By across the top.
- Renamed the Stats Context visual header to Stat Type while preserving the existing ALL / HITTING / PITCHING logic.
- Moved detailed search, position, year, team, league, bats, arm, attribute, and defense controls into a dedicated expandable Filters area.
- Added a persistent Applied Filters panel beside the card grid with removable active-filter chips and Clear All.
- Preserved existing filtering, sorting, Quick Sort, card results, and interactions; this update restructures presentation rather than the filter engine.
- Added responsive behavior so Applied Filters moves above the card grid on narrower screens/mobile.
- Packaging note: node_modules is intentionally excluded from the update ZIP; run npm install after replacing the project if dependencies are not already installed.

# Elements Baseball Change Log


## v1.3.28 — Rulebook Section III.D Card Example
- Added the provided Luke Williams atypical player card to Section III.D in the same source-relative location and presentation pattern used for the existing III.A, III.B, and III.C card examples.
- Preserved the original Rulebook wording, hierarchy, digital gameplay review markers, search, Quick Rules, and Simulated Demos separation.
- Reused the established responsive Rulebook card-media treatment so the III.D example remains uncropped, keeps its original aspect ratio, and scales cleanly on desktop and mobile.

## v1.3.3 — Unified Card Quick Controls
- Moved **Owned by Me** and **Season Eligible** into the same quick-control row as **Points**, **Year**, and **Name**.
- Removed the separate duplicate quick-filter chip row above the Cards filter surface.
- The two controls remain toggle filters while Points/Year/Name remain sort controls.
- The shared quick-control row wraps cleanly on narrow/mobile screens.

# Elements Baseball — Change Log

## v1.3.2 — Mobile Parity + Simplified Home
Date: August 7, 2026

### Changed
- Kept the existing global header intact while replacing the image-heavy Home dashboard with a simple 2×4 icon-tile system.
- Removed the Home pennant/masthead banner and tile artwork/descriptive copy.
- Made the signed-in profile/avatar control accessible on mobile so Log out is reachable.
- Moved **Owned by Me** and **Season Eligible** into an always-visible Card Database quick-filter row above Filters & Sort.
- Added mobile-friendly tap-to-select → tap-destination reordering for Batting Order, Bench, Rotation, and Bullpen while preserving desktop drag-and-drop.
- Added clear selected/target states and a mobile reorder hint without interfering with vertical scrolling.
- Corrected `PUSH_LIVE.command` so it publishes from the active `Project` repository instead of the parent folder.

### Authentication verification
- Existing account login/logout confirmed working after the v1.3.1 database migration.
- Will successfully claimed his manager account.
- Jeremiah successfully claimed his manager account after correcting the stored Discord username value.

---

This is the single permanent rolling change-history document for the project. New releases and implementation notes should be added here instead of creating additional `CHANGE_ME`, per-version changelog, release-note, or one-off update Markdown files. Newest release information belongs at the top.

## Backup / release policy

- `Project/` is the current working copy.
- `Stable Backups/` should contain only meaningful tested milestone backups, not every intermediate build ZIP.
- Update ZIPs are temporary and may be deleted after the update is incorporated, tested, published when applicable, and superseded by a confirmed stable backup.
- Keep strategically useful rollback milestones (for example, the pre-image-migration backup) even after a newer stable backup exists.

## v1.3.1 — Discord Manager Claim Compatibility Fix

### Fixed
- Corrected the Jeremiah Discord username typo from the original seeded manager migration.
- Updated manager-claim verification to treat Discord-style trailing numeric username suffixes (for example, `_57470`) as compatible with the same base username.
- Updated the first-time manager picker to use the same normalization, so the correct manager can still auto-select when Discord returns a suffixed/unsuffixed variant.
- Preserved the existing protections that prevent an already-claimed manager or Discord account from claiming another manager.

### Required Supabase step
- Run `supabase/migrations/20260807_discord_claim_username_compat.sql` once in the Supabase SQL Editor before retesting Will/Jeremiah.

### Scope
- Authentication/first-time manager claim only. No Cards, Team Builder, R2, layout, or saved-lineup behavior changed.


## v1.3.0 — Cloudflare R2 2025 Image Delivery

### Changed
- Migrated all 2,310 2025 card-image objects from Supabase Storage to Cloudflare R2.
- Routes existing public Supabase Storage URLs for `card-images/2025/*` to the matching R2 object path while retaining Supabase database metadata.
- Preserves filenames, card keys, non-2025 URL behavior, and Google Drive normalization.
- Applies through the shared image normalization used by Cards, Card Profile, and Team Builder.

### Verified
- R2 destination: 2,310 objects / 2.554 GiB.
- `rclone check`: 2,310 matching files and 0 differences.
- Localhost R2 image delivery verified in Chrome DevTools.
- Live Vercel R2 image delivery verified in Chrome DevTools.
- Production build passed (`tsc -b && vite build`).

### Safety / rollback
- Supabase 2025 image objects remain temporarily available as rollback protection.
- Stable pre-image-migration rollback point: v1.2.25.


---

## Previously consolidated history

# Changelog

## v1.2.8 — Pennant, Trades, and Milestones Polish

- Replaced hanging banner shapes with classic triangular pennants.
- Removed the Cooperstown and Est. 1871 text from the live masthead.
- Rebuilt José Ramírez's modern trade card using the supplied reference photo.
- Removed both World Series rings from Season Milestones and retained the two celebration photos with a smaller centered trophy.

## v1.2.6 — Home Exhibit Polish
- Rebuilt Cards, Trades, and Season Milestones as cohesive museum-style exhibits.
- Removed the pasted-photo/collage presentation from the updated artwork.
- Moved every homepage title into a fixed bottom label strip so artwork stays visible.
- Preserved the brightening, lift, and gold-glow hover behavior on desktop and mobile.

# Elements Baseball Changelog

## v1.2.0 — Home Tile Styling

- Preserved the clean title-only 2×4 dashboard.
- Added restrained module-specific visual motifs using CSS only.
- Strengthened black-and-gold depth, edge accents, hover feedback, and tile hierarchy.
- Kept Available and Coming Soon modules visually distinct.
- Preserved production, Demo Mode, desktop, tablet, and mobile behavior.

## v1.1.3 — Cleanup

- Removed confirmed-unused project files and cached build artifacts.
- Audited local imports and referenced public assets.
- Preserved all active functionality.

## 1.2.1 — Baseball History Home Art (Preview)
- Added a first responsive museum-style homepage art pass.
- Added vintage-to-modern baseball visuals across Cards, Team Builder, Trades, Milestones, Games, Standings, Statistics, and Rules.
- Added a Cooperstown-inspired exterior background with league-team pennant references.
- Preserved real React navigation tiles, hover states, mobile layout, and Demo Mode routes.

## v1.2.2 — Approved Baseball Museum Home
- Replaced all eight homepage tile backgrounds with the approved baseball-history composition.
- Added complete artwork for Cards, Team Builder, Trades, Season Milestones, Games, Standings, Statistics, and Rules.
- Preserved live React navigation, hover behavior, responsive layout, and Demo Mode routing.
- Updated the homepage label from Play to Games while retaining the existing `/play` route.
- Added the approved source composition for future responsive recropping and refinements.

## v1.2.3
- Fixed legacy Coming Soon styling that hid six homepage tile images.
- Confirmed all eight baseball-history tile backgrounds render on desktop and mobile.
## v1.2.5 — Authentic Home Artwork & Hover Fix
- Fixed homepage hover states so tile artwork brightens and lifts instead of disappearing.
- Updated the Cards tile with the supplied Elly De La Cruz photo.
- Updated the Trades tile with the supplied José Ramírez photo.
- Updated Season Milestones with the supplied 1927 Yankees and 1986 Mets celebration photos and championship-ring references.
- Renamed the homepage Games tile to Play while preserving the existing `/play` route.
- Preserved responsive desktop, tablet, mobile, and Demo Mode behavior.

## v1.2.7 — Museum Pennants and Milestone Exhibit
- Added live, responsive pennant displays so all ten league-favorite teams remain visible regardless of background cropping.
- Restored a prominent Elements Baseball / Cooperstown, New York museum identity above the homepage.
- Reworked Season Milestones with a smaller centered championship exhibit and removed the duplicated baked-in title.
- Preserved fixed bottom tile labels, Play naming, hover behavior, Demo Mode, and responsive layouts.

---

## Archived per-version notes (merged into this file)


### Source: `V1.2.25_CHANGELOG.md`

# v1.2.25 — Card Database Default Filter State

- Card Database **Filters & Sort** now begins collapsed by default on all devices.
- Users can still expand and collapse the drawer normally.
- No filter, sorting, Card Database layout, Team Builder, desktop, tablet, or mobile functionality was otherwise changed.


### Source: `V1.2.24_CHANGELOG.md`

# Elements Baseball v1.2.24

## Targeted tablet/mobile responsive corrections

- Preserved all approved desktop layouts and functionality.
- Changed the Home pennant masthead only on portrait tablet/mobile so the complete approved artwork fits without cover-cropping or overflow.
- Restored the compact four-column roster summary structure on touch devices, where pointer-specific desktop CSS did not apply.
- Reduced roster-selector summary typography at tablet and phone widths so Players, Points, DH, and Roster values remain readable and contained.
- No changes to Cards, Team Builder subpages, filter behavior, authentication, data, or desktop presentation.


### Source: `V1.2.23_CHANGELOG.md`

# Elements Baseball v1.2.23

## Responsive QA & Optimization

This release adds one authoritative responsive layer, imported after the existing application styles, so desktop and mobile behavior can be maintained without altering existing application logic.

### Global
- Stabilized the application header, profile menu, brand label, and back button at desktop, tablet, and mobile widths.
- Added overflow protection and responsive media handling.
- Added touch-friendly interaction sizing and iOS-safe input sizing.
- Added reduced-motion support.

### Home
- Preserved the approved four-column desktop composition.
- Uses a two-column tablet and mobile grid rather than oversized single-column tiles.
- Maintains the approved artwork and Elements branding.

### Card Database
- Preserved all filtering, sorting, ownership, eligibility, and card navigation behavior.
- Added controlled desktop, tablet, and mobile filter layouts.
- Uses a two-column card gallery on common mobile widths and a one-column fallback only on exceptionally narrow screens.
- Prevents filter fields and card metadata from forcing horizontal overflow.

### Team Builder roster selector
- Preserved all lineup creation, editing, settings, opening, and deletion behavior.
- Preserved the 5 × 4 large-desktop library.
- Added gradual four-, three-, and two-column desktop/tablet behavior.
- Functional roster tiles use the full mobile width, while reserved future slots remain in a compact two-column grid.

### Team Builder workspace
- Preserved all roster, fielding, batting order, bench, rotation, bullpen, drag/drop, save, and player-selection behavior.
- Converts the left navigation to a horizontally scrollable touch navigation on mobile.
- Reflows the header actions without clipping.
- Converts the player drawer into a full-width mobile sheet with independent scrolling.
- Reflows all Team Builder filters, attribute filters, fielding filters, comparison cards, and eligible-player cards for mobile use.

## Unchanged
- Authentication and Discord identity behavior
- Card Database functionality and filter logic
- Team Builder filtering and roster logic
- Approved Home artwork
- Supabase schema and migrations
- Vercel configuration


### Source: `V1.2.22_CHANGELOG.md`

# Elements Baseball v1.2.22

## Team Builder attribute filters
- Added the missing functional Attribute Filters section to the Team Builder player drawer.
- Added attribute selector, comparison operator, value, add/remove condition controls.
- Added Fielding Position and Minimum DEF controls.
- Connected all new controls to eligible-player filtering.
- Clear Filters resets the new controls.
- Card Database and roster selector remain unchanged.


### Source: `V1.2.21_CHANGELOG.md`

# Elements Baseball v1.2.21

## Team Builder filter drawer cleanup
- Replaced the accumulated Team Builder drawer class usage with a dedicated `tb-filter-*` namespace.
- Historical roster drawer overrides can no longer interfere with the approved layout.
- Preserved the approved organization:
  - Quick Sort on the left.
  - Attribute Sort and direction directly beside it.
  - Year, Team, League, Bats, Arm, and Clear Filters in one proportional row.
- Added controlled wide, medium, and narrow desktop behavior.
- Preserved all search, sort, filter, clear, collapse, and eligibility functionality.

## Unchanged
- Card Database.
- Team Builder roster page and roster actions.
- Home screen, pencil, Standings, authentication, routes, and publishing configuration.


### Source: `V1.2.20_CHANGELOG.md`

# Elements Baseball v1.2.20

## Team Builder filter drawer organization
- Layout-only update.
- Restored the approved reference organization:
  - Quick Sort remains a compact group on the left.
  - Attribute Sort sits directly beside it instead of stretching across the remaining drawer width.
  - Sort direction stays attached to the Attribute selector.
  - Year, Team, League, Bats, Arm, and Clear Filters remain in one balanced row.
- Rebalanced widths, spacing, and alignment to preserve the same structure across common desktop widths.
- Preserved all filtering, sorting, search, collapse, and clear-filter functionality.

## Frozen
- Card Database.
- Team Builder roster page and roster actions.
- Home screen, pencil, Standings, authentication, routes, and publishing configuration.


### Source: `V1.2.19_CHANGELOG.md`

# Elements Baseball v1.2.19

## Team Builder desktop responsiveness
- Layout-only update.
- Reviewed the accumulated responsive rules that previously jumped from five columns to three and then one column.
- Preserved the approved fixed-height 5 × 4 layout on full desktop windows.
- Added gradual desktop reflow:
  - 5 columns on full desktop.
  - 4 columns on compact desktop.
  - 3 columns on narrower desktop windows.
  - 2 columns on very narrow desktop windows.
- Prevented the compact roster-tile design from reverting to the older vertically stacked presentation.
- Preserved summary proportions, selectors, buttons, typography hierarchy, and button alignment.
- Allowed vertical page scrolling only when a narrowed desktop window cannot reasonably display all 20 slots at once.
- No mobile redesign and no functionality changes.

## Frozen
- Card Database.
- Team Builder filter drawer.
- All roster actions and settings.
- Home screen, pencil, Standings, authentication, routes, and publishing configuration.


### Source: `V1.2.18_CHANGELOG.md`

# Elements Baseball v1.2.18

## Targeted Team Builder button alignment
- Based directly on v1.2.17.
- Centered the Open and Delete button labels horizontally and vertically.
- No other layout, spacing, typography, colors, borders, dimensions, or functionality changed.


### Source: `V1.2.17_CHANGELOG.md`

# Elements Baseball v1.2.17

## Team Builder roster summary row
- Layout-only update.
- Kept the total summary-row width unchanged.
- Kept all four existing columns.
- Rebalanced internal column widths:
  - Players remains wide.
  - Points receives more room.
  - DH is reduced.
  - Roster is sized to its content.
- No functionality changed.

## Frozen
- Card Database.
- Team Builder filter drawer.
- All roster controls and behavior.
- Home screen, pencil, Standings, authentication, routes, and publishing configuration.


### Source: `V1.2.16_CHANGELOG.md`

# Elements Baseball v1.2.16

## Team Builder roster-tile redesign
- Preserved the fixed-height 5 × 4 grid and all 20 visible roster slots.
- Preserved all current roster functionality.
- Reorganized each functional roster tile into four efficient sections:
  - Name and status
  - One compact four-metric summary strip
  - DH and roster selectors
  - Open and Delete actions
- Replaced the taller 2 × 2 statistic boxes with one horizontal summary strip.
- Added consistent internal alignment and separators.
- Kept important values, controls, and buttons readable without clipping.
- Preserved the centered description-only page header.

## Frozen
- Card Database page and functionality.
- Team Builder filter drawer and functionality.
- Home screen, pencil, Standings, authentication, routes, and publishing configuration.


### Source: `V1.2.15_CHANGELOG.md`

# Elements Baseball v1.2.15

## Team Builder roster page
- Layout-only update.
- Removed the Elements Baseball eyebrow and Team Builder title.
- Retained only the centered description:
  `Build and manage your teams. Choose your roster rules and customize your team at any time.`
- Used the reclaimed header space to increase usable roster-tile space.
- Rebalanced each functional roster tile so all labels, statistics, selects, icons, and action buttons remain visible.
- Changed the four summary statistics to a readable 2 × 2 arrangement inside each tile.
- Preserved the fixed-height 5 × 4 grid and all 20 visible roster slots.
- Preserved all existing Team Builder functionality.

## Frozen
- Card Database page and functionality.
- Team Builder filter functionality.
- Home screen, pencil, Standings, authentication, routes, and publishing configuration.


### Source: `V1.2.14_CHANGELOG.md`

# Elements Baseball v1.2.14

## Team Builder filter drawer
- Layout-only update.
- Reorganized the drawer to match the approved reference structure:
  - Quick Sort on the left.
  - Attribute Sort and direction beside it.
  - Year, Team, League, Bats, Arm, and Clear Filters in one compact row.
- Reduced excess spacing and retained all existing functionality.

## Team Builder roster library
- Layout-only update.
- Added a fixed-height desktop layout.
- All 20 roster slots now fit within a 5 × 4 grid without vertical scrolling on standard desktop displays.
- Reduced tile height, spacing, padding, control sizes, and heading space.
- The first three roster slots remain functional.
- Remaining slots remain placeholders.

## Frozen
- Card Database page and functionality.
- Home screen, pencil, Standings, authentication, routes, and publishing configuration.


### Source: `V1.2.13_CHANGELOG.md`

# Elements Baseball v1.2.13

## Team Builder roster library
- Added a permanent 5 × 4 roster-slot layout for 20 total slots.
- The existing first three roster slots remain the only functional slots.
- Added non-functional reserved placeholders for the remaining future roster slots.
- Preserved all current create, edit, open, delete, DH, and roster-format functionality.
- Reduced roster-selector heading and grid spacing.

## Team Builder filter drawer
- Preserved all existing filtering and sorting functionality.
- Reorganized the existing controls into a compact two-row layout:
  - Quick Sort beside Attribute Sort and direction.
  - Year, Team, League, Bats, Arm, and Clear Filters in one row.
- Reduced excess spacing, padding, control height, and margins.

## Frozen
- Card Database page and all Card Database functionality.
- Home screen, pencil, Standings, authentication, routes, and publishing configuration.


### Source: `V1.2.12_CHANGELOG.md`

# Elements Baseball v1.2.12

## Card Database layout refinements
- Removed the Card Database page header.
- Kept all existing Card Database functionality unchanged.
- Reorganized Attribute, comparison, value, Fielding Position, and Minimum DEF into one compact horizontal layout when desktop width allows.
- Reduced vertical gaps, section spacing, and drawer padding.
- Reclaimed additional space above the card grid.

## Unchanged
- All filtering and sorting behavior
- Team Builder drawer
- Position chips
- Owned by Me
- Season Eligible
- Team search
- All Hitters and P filtering logic
- Home screen, pencil, Standings, authentication, routes, and publishing configuration


### Source: `V1.2.11_CHANGELOG.md`

# Elements Baseball v1.2.11

## Compact filter drawer pass

### Team Builder
- No functionality changed.
- Reduced heading, search, sort, filter, and control spacing.
- Tightened Quick Sort and Attribute Sort into a denser shared row.
- Reduced control heights, chip sizes, padding, and margins.
- Expanded desktop filters into one compact six-column row.

### Card Database
- No functionality changed.
- Reduced the drawer's maximum width and centered it.
- Tightened position chips, search, sort, filters, attribute filters, fielding filters, and primary chips.
- Reduced control heights, padding, margins, and section spacing.
- Preserved all Cards-specific filters and existing behavior.

### Locked
- All filtering and sorting logic
- Team Builder and Cards functionality
- Home screen, pencil, Standings, authentication, routes, and publishing configuration


### Source: `V1.2.10_CHANGELOG.md`

# Elements Baseball v1.2.10

## Team Builder — two approved refinements only
- Quick Sort now sits beside Attribute Sort.
- Adjusted Quick Sort label sizing, weight, and spacing to match the drawer.
- Removed the redundant second white `Filters` heading.
- No Team Builder functionality changed.

## Card Database — compact layout pass
- Kept the separate Cards filter drawer implementation.
- Preserved all existing Cards filtering and sorting functionality.
- Reduced outer padding, section spacing, control heights, chip sizes, and margins.
- Placed Quick Sort beside Attribute Sort.
- Arranged primary filters in a compact six-column desktop row.
- Tightened attribute filters, fielding filters, and Cards-specific chips.
- Added responsive fallbacks for smaller screens.

## Unchanged
- Cards filter logic and behavior
- Team Builder filtering behavior
- Home screen, pencil, Standings, authentication, routes, and publishing configuration


### Source: `V1.2.9_CHANGELOG.md`

# Elements Baseball v1.2.9

## Separate Cards filter drawer
- Team Builder filter drawer is frozen and was not modified.
- Added a new `CardsFilterDrawer.tsx` implementation used only by the Cards page.
- Cards no longer renders the shared Team Builder drawer component.
- Cards retains all existing functionality:
  - Position chips
  - Owned by Me
  - Season Eligible
  - Team search
  - Quick Sort and Attribute Sort
  - Attribute filters
  - Defense filters
  - All Hitters and P chart-specific filtering
- Added a dedicated Cards-only CSS namespace so future Cards layout changes cannot affect Team Builder.
- Cards filter drawer now uses the full Card Database content width with Team Builder-inspired control proportions, padding, and spacing.

## Frozen
- Team Builder drawer component
- Team Builder drawer CSS
- Team Builder sizing, spacing, and functionality
- Home screen, pencil, Standings, authentication, routes, and publishing configuration


### Source: `V1.2.8_CHANGELOG.md`

# Elements Baseball v1.2.8

## Clean universal drawer repair
- Removed the accumulated Cards-only drawer sizing rules.
- Added one shared `universal-filter-surface` outer layout used by both:
  - Team Builder player drawer
  - Cards filter drawer
- Width, padding, border, background, shadow, and responsive sizing now come from one CSS source.
- Team Builder keeps only its overlay positioning behavior.
- Cards keeps only its embedded-page positioning behavior.
- The shared `UniversalFilterDrawer` remains the single implementation for all controls and interactions.

## Preserved
- Cards-specific Position chips
- Owned by Me
- Season Eligible
- P filter pitching-chart logic
- All Hitters hitting-chart logic
- Home screen, pencil, Standings, authentication, routes, and publishing configuration


### Source: `V1.2.7_CHANGELOG.md`

# Elements Baseball v1.2.7

## Changed
- The Cards page now hosts the shared UniversalFilterDrawer using the exact same width, padding, border, background, and responsive dimensions as the Team Builder player drawer.
- No separate Cards drawer implementation was created; both pages continue to render the same shared UniversalFilterDrawer component.
- The Cards-specific Position, Owned by Me, and Season Eligible controls remain extensions around the shared component.
- The P position chip now requires actual pitching-chart data and excludes batter-only cards.

## Unchanged
- Team Builder drawer behavior
- Home screen and artwork
- Approved pencil
- Standings tile
- Authentication, navigation, routes, and publishing configuration


### Source: `V1.2.6_CHANGELOG.md`

# Elements Baseball v1.2.6

## Changed
- Cards page now uses the shared UniversalFilterDrawer with the same full-width sizing and spacing as Team Builder.
- Removed the Cards-only outer drawer styling that changed the shared component dimensions.
- Team filter on Cards is now the same searchable type-to-filter input used by Team Builder.
- All Hitters now requires actual hitting-chart data and excludes pitcher-only cards.

## Preserved
- Owned by Me, Season Eligible, and position chips remain Cards-specific extensions.
- Home screen, approved pencil, Standings tile, authentication, routing, and publishing files were not changed.


### Source: `V1.2.5_CHANGELOG.md`

# Elements Baseball v1.2.5

## Fixed
- Corrected all stale variable references in `FilterDrawer.tsx` introduced during the universal drawer refactor.
- Corrected year option values in the shared Lineup Builder drawer so they satisfy the shared component contract.
- Cards page runtime errors from v1.2.3 and v1.2.4 are resolved.

## Validation
- `npx tsc -b` completed successfully.
- Full Vite bundling could not run in the container because the uploaded Mac `node_modules` lacks the Linux Rollup optional binary. Run `npm install` and `npm run build` on the Mac.


### Source: `V1.2.4_CHANGELOG.md`

# Elements Baseball v1.2.4

## Fixed
- Corrected the Card Database runtime crash caused by an outdated `p` variable reference in `FilterDrawer.tsx`.
- The shared Universal Filter Drawer remains unchanged in scope and behavior.

## Validation
- Confirmed no remaining `p.` references in `FilterDrawer.tsx`.
- Modified TSX files passed TypeScript syntax transpilation.


### Source: `V1.2.3_CHANGELOG.md`

# Elements Baseball v1.2.3

## Changed
- Added one shared `UniversalFilterDrawer` component.
- Lineup Builder player selection now uses the shared component.
- Card Database now uses that same component instead of its separate drawer structure.
- Card Database adds only its page-specific controls:
  - Position chips
  - Owned by Me
  - Season Eligible
  - Attribute filters and fielding filters
- Search, collapse/expand, Quick Sort, Attribute Sort, sort direction, filter layout, Clear Filters, spacing, and interaction patterns now come from one source of truth.

## Unchanged
- Home screen and artwork
- Approved pencil
- Standings tile
- Authentication, navigation, routes, and publishing configuration

## Validation
- Modified TSX files passed TypeScript syntax transpilation.
- Run `npm install` and `npm run build` on the destination Mac for full validation.


### Source: `V1.2.2_CHANGELOG.md`

# Elements Baseball v1.2.2

## Scope
Card Database filter/sort alignment only.

## Changed
- Card Database now uses the same visual classes and interaction pattern as the Lineup Builder player drawer.
- Added position chips: ALL, All Hitters, P, C, 1B, 2B, 3B, SS, LF, CF, RF, DH.
- Search, Quick Sort, Attribute Sort, direction toggle, filters, collapse/expand, and active filter feedback follow the Lineup Builder pattern.
- Removed the visible Batting Chart / Pitching Chart selector.
- Hitter and pitcher attributes are grouped directly in unified sort and filter controls.
- Each attribute filter now remembers whether it is a hitter or pitcher attribute, so mixed hitter/pitcher conditions work correctly.

## Locked / Unchanged
- Home screen and all Home artwork.
- Approved lineup-name pencil.
- Standings tile.
- Authentication, routes, navigation, and publishing configuration.

## Validation
- Confirmed CardsPage imports the edited FilterDrawer.
- TypeScript project check passed with `tsc -b`.
- Full Vite build must be run on the destination Mac because the uploaded node_modules links are platform-specific.


### Source: `V1.2.0_CHANGELOG.md`

# Elements Baseball V1.2.0

## Changed
- Rebuilt the Card Database filter/sort drawer to match the Lineup Builder player drawer.
- Added position chips: ALL, All Hitters, P, C, 1B, 2B, 3B, SS, LF, CF, RF, DH.
- Removed the visible Batting Chart / Pitching Chart source selector.
- Added grouped Hitter and Pitcher attribute options.
- Replaced the boxed lineup-name pencil with a compact inline SVG pencil.

## Locked / Unchanged
- Home screen layout and artwork.
- Approved Standings tile.
- Card grid and card functionality outside the filter drawer.
- Lineup Builder outside the lineup-name edit control.
- Authentication, routing, Git metadata, and Vercel configuration.

## Validation
- Confirmed CardsPage imports and renders src/components/FilterDrawer.tsx.
- Confirmed HomePage and Home assets are unmodified.
- Confirmed TypeScript/TSX syntax for modified components.
- Full npm install/build could not be run in the packaging environment because its internal npm mirror did not contain zod 4.4.3. Run npm install and npm run build on the destination Mac.


### Source: `RELEASE_NOTES_v1.1.2.md`

# Elements Baseball v1.1.2

## Fixes
- Fixed empty Rotation, Bench, Bullpen, and Fielding slots so the Current/Add Player comparison panel and confirmation button remain visible after Clear Page.
- Empty slots now use a deliberate click/tap selection followed by Confirm Add.
- Existing roster replacements continue to require Confirm Swap.

## Home page polish
- Retained the clean title-only 2x4 dashboard.
- Added subtle black/gold gradients, edge accents, depth, and hover feedback without restoring icons or descriptions.
- Available and Coming Soon modules remain visually distinct.

## Shared behavior
- Changes apply to the league app, Demo Mode, desktop, tablet, and mobile layouts.


### Source: `RELEASE_NOTES_v1.1.1.md`

# Elements Baseball v1.1.1

- Simplified Home dashboard to title-only tiles.
- Replaced the placeholder eighth tile with Season Milestones.
- Added Season Milestones placeholder routes for production and Demo Mode.
- Added Clear Page and confirmed Clear Team controls.
- Fielding page clearing also clears its connected Batting Order.
- Roster candidates now require click/tap selection followed by Confirm Swap/Confirm Add.
- Hover is preview-only and can no longer perform a roster change.
- Stale substitutes reset between positions, filters, drawer closes, and completed swaps.
- Added a final eligibility check before every roster assignment.
- Desktop and mobile share the same confirmation workflow.


---

## Archived implementation/update notes (merged into this file)


### Source: `CARDS_FILTER_SORT_UPDATE.md`

# Cards Filter/Sort Visual Update

## Changed
- Renamed Advanced Sort to Attribute Sort.
- Moved Defense Position and Defense Rating controls out of the large Advanced Filters panel.
- Added a compact two-column defense toolbar directly beneath Attribute Sort.
- Renamed Advanced Filters to Attribute Filters.
- Kept the existing defensive sort and rating-filter logic unchanged.
- Compressed the attribute-filter panel styling.

## Test
1. Open Cards.
2. Choose Defense from Attribute Sort.
3. Choose a defensive position and verify sorting.
4. Choose a defense rating and verify filtering.
5. Expand Attribute Filters and verify existing multi-attribute filters still work.
6. Confirm no Lineup Builder pages changed.


### Source: `CARDS_UNIFIED_POSITION_DEFENSE_UPDATE.md`

# Cards Page — Unified Position and Defense Rebuild

## Changed

- Position is now the primary fielding-position filter.
- When a fielding position is selected and Attribute Sort is set to Defense, the defense sort automatically uses that position.
- Removed the redundant second defensive-position selection for that case.
- When Position is All, Multi, DH, or P, a defensive-position dropdown appears only when Defense sort needs one.
- Defense Rating appears only while Defense sort is active.
- Moving away from Defense sort clears the hidden defense-rating filter.
- Bats and Arm were consolidated into one compact left-aligned row.

## Test

1. Choose LF under Position.
2. Choose Defense under Attribute Sort.
3. Confirm the interface says it is using LF and does not ask for LF again.
4. Change the defense rating and confirm filtering works.
5. Change Position to CF and confirm Defense automatically uses CF.
6. Choose All under Position and confirm a defensive-position selector appears for Defense sort.
7. Change Attribute Sort away from Defense and confirm the defense controls disappear.
8. Confirm Bats and Arm display compactly in one row.


### Source: `CARD_DATABASE_FILTER_FINAL_FIX.md`

# Card Database Filter Final Fix

The Card Database now imports a dedicated `DatabaseFilterDrawer` component rather than the previous shared component path. This ensures the Card Database renders the Lineup Builder-style filter and sort interface, including the position chip row.

No Home-screen tile artwork was changed. The previously approved Standings artwork remains restored.


### Source: `CARD_FILTER_ALIGNMENT_UPDATE.md`

# Card Filter Alignment Update

Changes included:
- Restored the previously approved Home screen Standings tile artwork.
- Rebuilt the Card Database filter/sort area to match the Lineup Builder drawer hierarchy and visual language.
- Added position chips at the top: ALL, All Hitters, P, C, 1B, 2B, 3B, SS, LF, CF, RF, DH.
- Preserved existing Card Database filtering, sorting, ownership, season eligibility, attribute filtering, and routing behavior.


### Source: `CARD_FILTER_CORRECTED_FROM_UPLOADED_BASE.md`

# Card Filter Correction

This update was built directly from the user-uploaded `elements-baseball-app(13).zip`.

Changes:
- CardsPage now imports and renders the exact same `FilterDrawer` component used by the Lineup Builder.
- Position chips remain part of that shared drawer: ALL, All Hitters, P, C, 1B, 2B, 3B, SS, LF, CF, RF, DH.
- The approved inline SVG lineup-name pencil and its styling were preserved unchanged.
- Home screen artwork and tile graphics were not modified.


### Source: `CLEANUP_AUDIT.md`

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


### Source: `COLLAPSIBLE_DRAWER_UPDATE.md`

# Collapsible Drawer Update

## Cards
- Universal filter opens in a compact toolbar state by default.
- Name, Sort By, Order, active chips, and Filters & Sort remain visible.
- Full controls expand only when requested.

## Lineup Builder
- Player drawer opens with search, quick sorting, active requirement chips, and cards visible.
- Full attribute sorting and filters expand only when requested.
- No filter behavior or card-selection rules were removed.

## Validation
- TypeScript completed successfully before Vite started.
- The Vite bundle step could not finish in the packaging environment because the Rollup Linux optional dependency was unavailable.


### Source: `COMPACT_FILTER_DRAWER_UPDATE.md`

# Compact Filter Drawer Update

## Changes
- Cards now opens with Position set to All.
- Cards now opens sorted by Points, high to low.
- Reduced only the vertical density of the Cards filter drawer.
- Reduced only the vertical density of the Lineup Builder player drawer controls.
- No controls were moved, removed, renamed, or behaviorally changed.

## Validation
- TypeScript validation passed.
- The Vite bundle step could not run in the packaging environment because the internal npm registry was missing Rollup's Linux optional dependency.


### Source: `CURRENT_SUBSTITUTE_EMPHASIS_UPDATE.md`

# Current / Substitute Emphasis Update

- Enlarged Current and Substitute cards on desktop.
- Widened the fixed comparison rail while preserving a five-card replacement grid.
- Enlarged comparison cards and labels on mobile.
- Preserved two replacement cards per mobile row.
- Shared CSS applies equally to production and Demo Mode.


### Source: `DEMO_ALL_2025_UPDATE.md`

# Demo Mode — All 2025 Cards

- Demo Card Database is locked to the 2025 season.
- Demo ownership filters and ownership badges are hidden.
- Demo Lineup Builder replacement drawers can use any published, season-eligible 2025 card regardless of manager ownership.
- Normal authenticated league accounts keep their existing ownership restrictions.
- Demo changes remain temporary and are not saved.


### Source: `DEMO_MODE_UPDATE.md`

# Public Demo Mode Update

- Added a public, no-login demo at `/demo`.
- Demo routes reuse the existing Home, Cards, Card Profile, Lineup Builder, and Coming Soon pages.
- Added a prepared sample lineup for the demo Lineup Builder.
- Demo substitutions, filters, DH toggles, and rearranging stay in memory only.
- All persistent lineup writes are bypassed in demo mode.
- Save displays `Demo — Not Saved` and confirms that demo changes are not saved.
- Manager claiming, lineup creation, deletion, and logout controls are not shown in demo mode.
- Added a visible `Demo Mode / Public Preview / Changes are not saved` indicator.

Shareable route after deployment:

https://elements-baseball.vercel.app/demo


### Source: `FINAL_SHOWCASE_CLEANUP_UPDATE.md`

# Final Showcase Cleanup

- Unified DEF-strip typography; only scores are bold.
- Removed redundant standalone section headings and all Active Roster group counts.
- Differentiated Batting Order with a connected numbered sequence treatment.
- Fielding now hides the DEF strip, collapses the sidebar to icons, removes the 9/9 badge, and uses the full remaining viewport for proportional field scaling.


### Source: `FINAL_SUBSTITUTE_WORKSPACE_UPDATE.md`

# Final Substitute Workspace Update

- Added white positional `C` to the C DEF pill.
- Batting Order rows are now drag-and-drop reorder only and no longer open the player picker.
- Substitute workspace now uses the full viewport width on desktop.
- Current/Substitute comparison stays in a compact left rail.
- Search, quick sort, and filters remain compact at the top.
- Candidate cards use the remaining workspace in a fixed five-column desktop grid.
- Mobile keeps tap-to-preview, Make Swap confirmation, full-width drawer, and two cards per row.
- Production and Demo Mode share the same components and styles.


### Source: `FINAL_VIEWPORT_POLISH_UPDATE.md`

# Final Viewport Polish Update

- Significantly reduced the Card Database hero/header height.
- Tightened Card Database heading spacing without changing content or behavior.
- Added height-aware Lineup Builder density for normal maximized desktop windows.
- Distributed C DEF, INF DEF, and OF DEF evenly across the full summary row.
- Centered the outgoing/current card in a dedicated comparison stage.
- Preserved all roster, filtering, sorting, eligibility, and point-cap behavior.


### Source: `FINAL_WILL_TEST_CLEANUP.md`

# Final Will Test Cleanup

- Removed duplicate heading/count rows from Batting Order, Bench, Rotation, and Bullpen.
- Rebalanced the DEF strip into three spaced groups with subtle dividers.
- Changed the DEF strip to a dark, lightly gold-tinted status bar.
- Reduced pill size and visual weight while retaining the Elements gold identity.
- Preserved all lineup, roster, sorting, eligibility, and persistence behavior.


### Source: `FINAL_WORKSPACE_DEF_ICONS_UPDATE.md`

# Final Workspace / DEF / Icons Update

- Reworked the DEF strip as a dark, subtly gold-tinted control surface.
- Added consistent muted-gold score pills and more breathing room between C, INF, and OF groups.
- Replaced the inconsistent silhouette icons with a unified line-icon family.
- Converted the lineup builder into a fixed-height browser workspace.
- Roster list pages now use the available viewport height and scroll internally only when necessary.


### Source: `HOMEPAGE_FIXED_HEADER_UPDATE.md`

# Homepage Fixed Height + Global Header Update

- Corrected the invalid escaped CSS block that prevented the desktop homepage fixed-height rules from applying.
- Homepage now uses the exact remaining viewport beneath the global header on desktop.
- All five feature cards fit within the single-screen dashboard layout.
- Reduced the global authenticated header from 74px to 60px on desktop and 56px on smaller screens.
- Synchronized lineup-builder viewport calculations with the new global header height.
- Mobile/tablet homepage remains normally scrollable.


### Source: `HORIZONTAL_SWAP_WORKSPACE_UPDATE.md`

# Horizontal Swap Workspace Update

- Desktop keeps Current and Substitute fixed side by side.
- The collection uses three large cards across and scrolls vertically.
- Mobile preserves the same layout concept: Current, Substitute, and one collection card across.
- The collection is the only scrolling region.
- The direction indicator now reads left-to-right.
- Production and Demo Mode share the same component and CSS.


### Source: `IMMEDIATE_FEEDBACK_FIXES.md`

# Immediate Feedback Fixes

- Replaced oversized logout control with avatar/profile menu.
- Added persistent points used / points remaining status in Team Builder.
- Added saving state, disabled save while pending, and clear success/error messages.
- Mobile player replacement now uses tap-to-preview plus Make Swap confirmation.
- Added prominent Owned by Me and Season Eligible toggles. Season eligibility uses `source_yes_field IS NOT NULL`.
- Removed duplicate Name/Sort/Order controls from expanded Filters panel.
- Renamed Filters & Sort to Filters.
- Added All Hitters and year-range filters.
- Moved Batting/Pitching selection into Attribute Filters.
- Shows an attribute filter row by default and added fielding-score filtering.
- Included mobile contrast refinements and retained mobile DEF/diamond fixes.
- Included the corrected Discord manager-claim username normalization.


### Source: `MERGE_NOTES.md`

# Merged Publish-Ready Project

This package uses the uploaded `elements-baseball-app(12).zip` as the source of truth for all current application code and Home-screen visuals.

Restored from the stable beta backup:
- `.git` repository metadata, history, branch tracking, and GitHub origin
- Vercel SPA routing configuration
- `PUSH_LIVE.command`
- `RUN_LOCAL.command`
- `APPLY_UPDATE.command`
- publishing/testing documentation

Not replaced from the stable beta:
- `src/`
- `public/`
- current Home-screen graphics
- current package files
- current application functionality

`node_modules`, `dist`, and `.vite` were removed so dependencies install cleanly on the destination Mac.


### Source: `MOBILE_LINEUP_QA_FIX.md`

# Mobile Lineup Builder QA Fix

- Constrained the DEF summary strip to the mobile roster content width.
- Changed the mobile DEF summary into stacked C DEF / INF DEF / OF DEF groups.
- Allowed score pills to wrap without causing horizontal page overflow.
- Hid OB and Control diamonds below 768px only.
- Desktop and tablet rating logic and visuals remain unchanged.


### Source: `PHASE_1_AUTH_UPDATE.md`

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


### Source: `PHASE_2_PASS_1_UPDATE.md`

# Phase 2 — Pass 1

## Changed
- Enlarged the existing card-selection drawer without changing its behavior.
- Increased usable width, spacing, search-field size, card size, and card-grid spacing.
- Added responsive 5/4/3/2/1-column card layouts.
- Improved the drawer scrollbar and preserved the existing filters, sorting, eligibility rules, point-cap logic, and card-selection behavior.
- Updated the Lineup Selector so the user-defined lineup name replaces the generic `Lineup 1`, `Lineup 2`, or `Lineup 3` label.

## Test
1. Open every Lineup Builder page and click an empty or filled player slot.
2. Confirm the drawer is significantly wider and cards are easier to browse.
3. Search, filter, sort, and select cards as before.
4. Confirm blocked cards still show roster-limit or point-cap messages.
5. Rename a lineup, return to the selector, and confirm the custom name is shown in the card topline.
6. Confirm no completed Lineup Builder page changed outside the drawer.


### Source: `PHASE_2_PASS_2_UPDATE.md`

# Phase 2 — Pass 2

## Updated
- Moved the drawer below the 74px authenticated app header so the close button is fully visible.
- Added a sticky drawer control panel containing the heading, close button, search, quick sort, attribute sort, and filters.
- Compressed the controls into a denser desktop toolbar so more cards remain visible.
- Kept the card results as the main drawer scroll area beneath the sticky controls.
- Added responsive toolbar layouts for smaller screens.

## Unchanged
- Search, filtering, sorting, eligibility, roster rules, point-cap logic, and player selection behavior.
- All completed Lineup Builder page layouts.


### Source: `RESPONSIVE_COMPARISON_UPDATE.md`

# Responsive Comparison Update

## Changes
- Replaced the large Active Roster defensive summary with one compact horizontal row.
- Added labels for all three infield combinations.
- Added a current-player comparison panel on the left whenever an occupied roster slot is being replaced.
- Kept the comparison panel hidden when adding to an empty slot.
- Changed the replacement-card grid to fluid responsive sizing based on available width.
- Preserved all player eligibility, sorting, filtering, roster-limit, and point-cap behavior.

## Testing
1. Open Active Roster and confirm the defense summary is one compact row.
2. Confirm the three infield combination labels and scores are correct.
3. Replace a player from Active Roster, Fielding, Batting Order, Bench, Rotation, and Bullpen.
4. Confirm the current card appears at left and replacement cards appear at right.
5. Open an empty slot and confirm the comparison panel is absent.
6. Resize the browser and confirm the number/size of cards adjusts automatically.


### Source: `SHARED_UI_ALIGNMENT_UPDATE.md`

# Shared UI Alignment Update

Applied to shared production and demo components:

- Compact global header on every page with horizontal avatar/name/Discord identity.
- Active Roster DEF strip now matches the dark panel system with muted gold accents.
- Substitute comparison is limited to the upper viewport and eligible cards scroll below.
- Team Builder cards scale to a future 5-column by 4-row roster library.
- Card Database ownership/eligibility chips sit below the filter toolbar and above cards.
- Responsive behavior included for mobile, tablet, and desktop.


### Source: `SIDEBAR_WORKSPACE_UPDATE.md`

# Sidebar Workspace Update

- Replaced horizontal Lineup Builder tabs with a baseball-themed left sidebar.
- Removed the repeated roster summary from every lineup page.
- Moved DH and roster-size controls to the Lineup Selector cards.
- Added 18/4000 and 26/6000 limits to each selector card.
- Added a compact lineup/page header with Clear and Save Team actions.
- Removed redundant Card Database descriptions.
- Added a centered current-player vs preview-player comparison strip.
- Added responsive sidebar behavior for narrower screens.


### Source: `SUBSTITUTE_SIDEBAR_UPDATE.md`

# Substitute Sidebar Update

- DEF position labels use white text; scores remain gold.
- Desktop replacement workflow uses a fixed CURRENT / SUBSTITUTE sidebar.
- Search, quick sort, and filter controls remain compact so the card rows dominate.
- Eligible cards scroll independently in the large right-hand workspace.
- Mobile keeps tap-to-select and Make Swap confirmation with a compact side-by-side comparison.
- Shared components keep production and `/demo` aligned.


### Source: `TEAM_BUILDER_FOLLOWUP_UPDATE.md`

# Team Builder Follow-up Update

- Added inline team-name editing on desktop and mobile.
- Reworded the Team Builder introduction.
- Added 25-player / 5,500-point roster preset.
- Renamed visible Lineup Builder labels to Team Builder.
- Renamed Potential Replacement to Substitute.
- Rebalanced replacement screen so comparison stays in the top portion and choices scroll below.
- Removed the Card Database result counter.
- Reduced Card Database header/toolbar vertical space.
- Preserved mobile-specific tap-to-compare and responsive layouts.


### Source: `THREE_SMALL_UPDATES.md`

# Three Small Updates

1. Card Database attribute controls now present hitter and pitcher attributes directly in grouped menus, matching the Lineup Builder terminology. The separate Attribute Source control was removed.
2. The lineup-name edit control is now a smaller, unboxed pencil icon beside the lineup name.
3. The Home Standings tile retains its approved frame and title artwork, with the scoreboard face updated to a Fenway-style AL East board using W, L, and GB columns.

No other Home tile artwork or application functionality was intentionally changed.


### Source: `UI_DENSITY_UPDATE.md`

# UI Density Update

## Changed
- Reduced the Lineup Builder title/header height.
- Reduced the roster summary/status rail height.
- Reduced tab height and surrounding spacing.
- Further compressed the collapsed player-picker toolbar.
- Removed duplicated name, year/team, position, and points text beneath player card art.
- Kept the After Add projection and action button.
- Reduced card size and increased desktop grid density to six cards per row where space allows.

## Not changed
- No roster rules or limits.
- No filtering or sorting behavior.
- No assignment behavior.
- No completed page redesigns.


### Source: `UNIVERSAL_FILTER_DRAWER_UPDATE.md`

# Universal Elements Filter Drawer – Cards First

## Added
- Compact, horizontal black/gold universal filter interface on Cards.
- Name, Position, Year, Team, League, Bats, Throws, Ownership, and Chart dropdowns.
- Removed Multi from Position.
- Batting Chart / Pitching Chart selector.
- Unified Sort By and Order controls.
- Complete chart-specific attribute lists including Ftg, Outs, BsR, SB, IP, 1B, 1B+, 2B, 3B, HR, BB, GB, FB, and K.
- Mathematical attribute filters with =, ≠, <, ≤, >, and ≥.
- Gmail-style active filter chips.
- Shared chart outcomes now read the batting or pitching Supabase field according to the selected Chart.

## Validation
- `npx tsc -b` passes.
- Full Vite build was blocked only by the copied node_modules Rollup optional-dependency issue. Reinstall dependencies locally with `npm install` if needed.

## v1.3.4 — Cards Stats Context + Lineup Builder Years
- Reduced Cards gallery tile density so two complete rows are easier to view on desktop without redesigning the cards.
- Kept Quick Sort in one horizontal row when Filters & Sort is expanded; narrow views can scroll the row horizontally instead of stacking it vertically.
- Added `Stats Context: ALL | HITTING | PITCHING` to separate overlapping batting and pitching attributes, including two-way-player cases.
- Attribute Sort and Attribute Filters now respect Stats Context; ALL clearly labels Hitting vs Pitching attributes.
- Preserved explicit High-to-Low / Low-to-High attribute sorting.
- Updated the Lineup Builder card loader to retrieve all published cards and card images with stable `card_key` pagination instead of hard-coding the 2025 dataset. Existing season-eligibility and ownership rules still determine which cards can be selected.
- Demo-mode year locking remains unchanged.

## v1.3.6 — Cards sizing + Team Builder all-years toggle
- Increased Cards gallery sizing to target six cards across on full desktop while preserving responsive breakpoints.
- Renamed Cards "Stat Type" to "Chart Type" without changing behavior.
- Renamed Cards "Minimum DEF" to "DEF" and compacted the attribute/DEF filter row.
- Added a shared Team Builder "Season Eligible" ON/OFF control across Active Roster, Fielding, Batting Order, Bench, Rotation, and Bullpen.
- Season Eligible ON preserves the existing season-eligibility filter; OFF exposes owned published cards from all loaded years.
- Saved lineups persist the Season Eligible toggle in roster_state; existing lineups default to ON.
- Switching eligibility does not delete players already assigned to a roster.

## v1.3.8 — Team Builder UI Consistency Pass
- Refreshed the Team Builder player-selection drawer to use the approved Cards visual language while preserving its drawer-specific workflow.
- Renamed Attribute Sort presentation to Sort By and Minimum DEF to DEF.
- Added compact removable Applied Filters chips inside the player drawer.
- Standardized Quick Sort/control styling, spacing, headings, and responsive behavior with Cards.
- Preserved Cards, Player Profile, Season Eligible placement/logic, roster pages, and card-selection functionality.

## v1.3.10 — Attribute Filter Alignment Refinement
- Reworked the shared Cards/Team Builder Attribute Filters toolbar alignment without changing filtering behavior.
- Added one shared label band and one shared control height so Attribute, operator, Value, remove, Fielding Position, DEF, and Add Filter sit on a true common control centerline.
- Balanced desktop column proportions so Select an Attribute no longer dominates the row.
- Standardized Fielding Position / DEF label height and spacing above their controls.
- Standardized control height, internal vertical centering, gaps, and Add Filter alignment.
- Preserved the existing responsive stacked behavior below desktop width.


## v1.3.11 — Milestones, Rules, and Filter Workspace Layout

- Replaced the Season Milestones placeholder with a Season 10 / 1925 milestone dashboard using the supplied official milestone structure.
- Added Standard milestone views for the Negro League, MLB, and Combined phases plus Consistency, Ladder, and Community milestone sections.
- Replaced the Rules placeholder with an in-app searchable Elements Baseball League Rulebook using the supplied rulebook text.
- Added rulebook section navigation, quick-reference shortcuts, search, and full-rulebook browsing.
- Restructured the Cards filter workspace around the approved Picture 3 organization: filters above the card grid with a conditional Applied Filters panel beside them.
- Applied Filters now disappears completely when no filters are active and the filter area automatically reclaims the available width.
- Updated the Team Builder player-selection filter workspace to use the same conditional Applied Filters structure while preserving Team Builder-specific controls and behavior.
- Preserved all existing filtering, sorting, roster selection, card interactions, Season Eligible behavior, and responsive fallbacks.
- Consolidated version notes into this continuous CHANGELOG; separate per-version update-note files are no longer created.

## v1.3.12 — Milestones Progression + Rules Reference Polish

- Refined the Season 10 / 1925 Milestones page into a more intentional achievement/progression interface without changing any official milestone rewards or milestone data.
- Preserved the three Season 10 phases and Standard / Consistency / Ladder / Community navigation while strengthening phase and track hierarchy.
- Reworked milestone rows into a connected progression track with clearer threshold, reward, and published-status zones.
- Kept milestone status truthful: no completed/current/locked state is inferred until reliable manager/game progress data is connected.
- Added tracker-ready presentation hooks so future live milestone states can be added without another structural redesign.
- Improved Milestones desktop/tablet/mobile density, spacing, hierarchy, and scanning while retaining all supplied milestone content.
- Refined the Rules page as an in-game reference tool rather than rebuilding its existing architecture.
- Promoted Search Rules into the Rules hero, strengthened sticky section navigation, improved section hierarchy, and made nested rule text easier to scan.
- Updated Quick Rules into clearer direct-jump reference controls while preserving the existing search/navigation behavior.
- Added non-functional demo metadata/hooks to common Quick Rules so future visual rule examples can be attached without restructuring the Rules page.
- Added a subtle future Visual Rule Demos note without enabling or simulating any demo functionality yet.
- Preserved the supplied rulebook wording and all existing Rules navigation/search functionality.
- Continued all update history in this single CHANGELOG only.

## v1.3.13 — Milestone Progress Tracker + Rulebook / Demo Separation

- Removed the Milestones right-side informational column and expanded the primary milestone progression area to use the full available width.
- Replaced the hard-coded `Announced / Tracker-ready` milestone status with a visible Progress area that shows the milestone target and explicitly states when live progress data is not connected.
- Preserved all official Season 10 milestone thresholds and rewards; no completion/current values are fabricated.
- Added tracker-ready progress-bar structure so real manager, week, phase-game, total-game, and league-wide progress can populate the same UI when a reliable data source is connected.
- Split Rules into two distinct top-level experiences: `Rulebook` and `Simulated Demos`.
- Preserved the traditional searchable Rulebook as the authoritative rules reference with its existing sections, Quick Rules, search, and Full Rulebook navigation.
- Added a separate Simulated Demos workspace with planned situation cards for Pitch vs. Swing, Fielding Checks, Extra Bases, Stolen Bases, Bunting, and Fatigue.
- Did not create or fake a simulation engine; demo controls are intentionally marked as coming later.
- Removed the prior mixed-in future-demo note from the traditional Rulebook navigation so official rules and visual-learning experiences remain clearly separated.
- Preserved rulebook text, milestone data, routes, and existing navigation behavior.

## v1.3.14 — Standings + Live Season 10 Milestone Tracker Snapshot

- Replaced the Standings placeholder with a full Elements standings page using two tabs: Current Standings and All-Time Standings.
- Current Standings are reconstructed from the supplied Season 10 Discord results from June 16 through August 9, 2026 and rank managers by games played, then wins, then run differential.
- All-Time Standings reproduce the main workbook STANDINGS tab snapshot, with the workbook `Suppa` identity displayed as Anthony in-app.
- Added current-manager highlighting to standings rows when a logged-in manager profile matches the row.
- Connected Milestones to a Season 10 manager tracking snapshot for all current managers, including phase games, total games, and Monday–Sunday consistency-week participation.
- Added a manager selector so every manager's Standard, Consistency, and Ladder progress can be reviewed from the same Milestones page.
- Replaced unconnected milestone progress with real completed/progress/remaining states based on reported Season 10 results.
- Added a Monday–Sunday weekly consistency strip showing each qualifying week through August 9 and the current August 10–16 week.
- Added league-wide Community milestone progress from the reconstructed results: manager GP thresholds and total unique games.
- Preserved official milestone reward text and existing milestone navigation/data.
- Continued version history only in this single CHANGELOG.

### v1.3.14 data reconciliation correction
- Reconciled Season 10.1 standings using the workbook snapshot through June 26 as the baseline, then appended every supplied result from June 27 through August 9 rather than rebuilding standings only from the Discord export.
- Current Standings now include exactly the 10 managers who have played in Season 10.1: Will, Anthony, Eric, Ryan, Zeek, James, Ben, Nate, Chuck, and Jeremiah.
- Replaced the stale/incomplete workbook STANDINGS roster with the supplied 21-manager Overall Standings source-of-truth list, including Will, Anthony, Eric, John, Ryan, Zeek, Mark, James, Ben, Nate, Chuck, Matt, Jeremiah, Ramel, Daniel, Zach, Brad, Jaycen, Miles, Sisu, and PFly.
- Updated all Season 10 milestone trackers to the reconciled GP totals and phase split; Monday–Sunday Consistency participation continues to come from the complete supplied Discord date history from June 16 through August 9.
- Updated Community milestone progress to 199 total Season 10.1 games, 4 managers at 25 GP, 4 at 50 GP, 2 at 75 GP, and 1 at 100 GP.

## v1.3.15 — Document1 Source-of-Truth Correction

- Replaced all Discord-derived Season 10.1 standings and milestone GP calculations with the verified `Document1` → `STANDINGS` workbook snapshot.
- Current Standings now reproduce the workbook Season 10.1 values exactly; Anthony is 26–20 with 46 GP in this snapshot.
- All-Time Standings remain workbook-backed display/reference data only and never feed milestone progress.
- Standard and Ladder milestone progress now use only each manager’s Season 10.1 `Total` from the workbook.
- Community manager-threshold progress is calculated from those same Season 10.1 totals; league-game progress is derived from the workbook totals (111 completed games / 222 combined manager GP).
- Removed Discord-derived phase splits, weekly participation, and reconstructed game totals from the milestone data layer.
- Consistency remains intentionally unconnected until Monday–Sunday weekly participation is represented in `Document1`; the app no longer infers it from Discord results.
- Continued version history only in this single `CHANGELOG.md`.

## v1.3.16 — Sortable Standings + RD%

- Added the workbook-style `RD%` column to both Current Standings and All-Time Standings.
- `RD%` follows the Document1 workbook calculation (`RS / RA`), matching values such as Anthony Season 10.1 = 1.29.
- Made every standings column header interactive and sortable, including Manager, W, L, GP, Win %, RS, RA, RS/G, RA/G, RD, and RD%.
- Rank can also be selected to return to the source-order ranking direction.
- Set the default standings sort to Games Played (`GP`) high to low on initial load.
- New numeric sorts default high to low; Manager and Rank default low to high, with repeated clicks toggling direction.
- Preserved Document1 as the sole standings source of truth and made no changes to milestone-tracking logic.
- Continued version history only in this single `CHANGELOG.md`.

## v1.3.17 — Standings Headers + Rules Layout Correction

- Reworked both Standings hero headers to use one shared hierarchy: `Elements Baseball League Standings` → current view title → view identifier.
- Current Standings now displays `Current Standings` and `Season 10.1 - 1925` with no descriptive subtitle text.
- All-Time Standings now displays `All-Time Standings` and `All-Time` with the same sizing, spacing, and alignment as Current Standings.
- Preserved all v1.3.16 standings data, RD%, sorting behavior, summary totals, tabs, and workbook source-of-truth logic.
- Fixed the Rules compression at the underlying CSS selector level: legacy `.rules-lines p` grid styling was unintentionally applying to the newer nested rule-item paragraphs and forcing the text into the old 12px grid column.
- Scoped the legacy rule selectors to direct-child paragraphs only and explicitly restored full-width block flow for v2 rule-item text.
- Reinforced the Rulebook layout with `min-width: 0` and balanced grid constraints so the navigation and reading panel use available desktop width correctly and collapse cleanly at responsive breakpoints.
- Preserved Rulebook search/navigation, Quick Rules, Simulated Demos separation, rule content, and all existing functionality.
- Continued version history only in this single `CHANGELOG.md`.

## v1.3.18 — Standings + Milestones Redundancy Cleanup

- Simplified the Standings view tabs to `Current Standings` and `All-Time Standings`, removing the repeated `Season 10.1` and `Workbook History` labels already communicated by the page header.
- Preserved the Standings hero titles, summary statistics, sortable columns, RD%, workbook-backed data, and all existing functionality.
- Removed the technical Document1 snapshot/source sentence from the Milestones hero while preserving the manager GP / wins / losses summary and manager selector.
- Removed repeated Season 10.1 GP totals from all three phase cards; phase cards now focus only on Phase, weeks, and Negro Leagues / MLB / Combined season context.
- Removed repeated `Tracking • Manager` / `Tracking • League` badges from milestone category panels because the manager selector and Community context already establish tracking scope.
- Removed redundant source-of-truth helper text from Standard and Consistency milestone panel headers.
- Retained concise explanatory text for Ladder and Community because those descriptions distinguish their actual progression mechanics.
- Consolidated the Consistency unconnected state into one clear notice instead of repeating the same workbook-tracker limitation in multiple places.
- Tightened affected spacing so removed content does not leave awkward gaps; no milestone data, progress logic, navigation, or controls were changed.
- Continued version history only in this single `CHANGELOG.md`.

## v1.3.19 — Milestones Achievement Flair + Rules Polish

- Upgraded Milestones presentation without changing workbook-backed progress logic, milestone thresholds, rewards, manager tracking, or navigation.
- Added clear season-phase states: Phase 1 is visually completed, Phase 2 is identified as the current phase, and Phase 3 is presented as upcoming while all three remain selectable.
- Added restrained category iconography to Standard, Consistency, Ladder, and Community while preserving the existing four-tab structure.
- Added distinct achievement states to milestone rows: completed milestones now read as earned/unlocked, the first incomplete milestone is emphasized as `Next Up`, and later milestones are quieter until approached.
- Strengthened completed milestone check/seal treatment, reward hierarchy, progress emphasis, and subtle gold progression styling.
- Added restrained baseball-inspired circular linework to the Milestones hero for visual depth without reducing readability.
- Polished Rulebook reading panels with subtle depth, hover feedback, gold reference accents, and improved Quick Rules card treatment while preserving all rule text and behavior.
- Added subtle interactive depth to Simulated Demo cards while keeping all demo controls disabled and honestly marked as future functionality.
- Preserved responsive behavior and added mobile-specific safeguards for the new visual treatments.
- Continued version history only in this single `CHANGELOG.md`.

## v1.3.20 — Milestones Showcase + Editorial Rulebook
- Rebuilt the Milestones presentation layer into a stronger achievement/progression showcase without changing workbook-driven tracking logic.
- Added a connected Season 10 phase timeline with Completed / Now Playing / On Deck visual states.
- Added a featured Next Achievement card with reward emphasis and a larger progress meter.
- Added stronger Earned / Next / Upcoming states, major-checkpoint treatments, reward iconography, and restrained historical-baseball visual motifs.
- Added a visual Ladder map / You Are Here treatment, a 26-week Consistency calendar shell, and a Community league-progress scoreboard.
- Reworked Rulebook content into an editorial reading system with left-aligned body copy, stronger chapter hierarchy, semantic callouts, formula/check treatments, and compact Quick Rules.
- Enhanced the Simulated Demos placeholder cards so they visually read as a future step-by-step learning environment while keeping the simulation engine disabled.
- Preserved all existing Milestones data/tracking, Rulebook text, search, navigation, and demo architecture.

## v1.3.21 — Original Rulebook Digital Edition
- Rebuilt the Rulebook presentation around the original Elements Baseball League Rulebook section order, section names, hierarchy, and authoritative wording.
- Replaced shortened website aliases in the table of contents with the original Rulebook section names.
- Added Roman-numeral section navigation, hierarchical rule numbering, original nested indentation, and in-section navigation for named Advanced/Fatigue subsections.
- Reworked the reading experience into a cohesive digital manual rather than a collection of generic rule cards.
- Added restrained editorial treatments for source-authored examples, notes, formulas/checks, and conditional rules without rewriting the underlying rule text.
- Compacted Quick Rules into a separate in-game reference strip while preserving the authoritative Rulebook structure beneath it.
- Preserved Rulebook vs. Simulated Demos as separate experiences and did not reorganize the Rulebook around demos.
- Added responsive desktop/tablet/mobile behavior for the table of contents, nested rules, and reading panel.

## v1.3.22 — Milestones Trophy Room Achievement Showcase
- Reworked the Milestones presentation into a more ambitious Elements Baseball achievement showcase while preserving every workbook-driven threshold, reward, progress calculation, manager selector, category, and phase behavior.
- Replaced generic category symbols with a cohesive custom baseball achievement crest system: pennant/baseball for Standard, scorecard/calendar for Consistency, trophy/steps for Ladder, and stadium/league crest for Community.
- Rebuilt milestone threshold presentation as collectible plaque/medallion treatments with distinct Earned, Chasing, Upcoming, and Major Checkpoint states.
- Strengthened completed milestones with trophy-room gold treatments, earned seals, completion accents, and more prestigious progress presentation.
- Added category-specific visual identity, baseball-card/foil/team/player reward glyph treatments, vintage scorebook/clubhouse textures, and restrained historical baseball ornament throughout the Milestones page.
- Elevated major thresholds such as 50, 100, 200, 300, 500, and 1000 into featured checkpoint moments without changing their underlying data or rewards.
- Preserved the existing Next Achievement, phase timeline, Ladder map, Consistency tracker shell, and Community scoreboard while visually integrating them into the new achievement system.
- Added responsive desktop/tablet/mobile treatments so badge geometry, milestone rows, progression rails, and reward content remain readable and functional at narrow widths.
- Continued version history only in this single `CHANGELOG.md`.

## v1.3.23 — Public Beta Cards + Team Builder Usability Fixes

- Added a comparison operator to Fielding Position / DEF filters in both Cards and Team Builder (`=`, `≠`, `<`, `≤`, `>`, `≥`).
- Preserved the prior minimum-defense behavior as the default (`≥`), while allowing searches such as `C DEF ≥ 6`.
- Updated Applied Filters labels so the selected fielding position, comparison operator, and DEF value are visible together.
- Rebuilt the Team Builder player-selection overlay height model so filter controls and the substitution workspace share the actual available viewport instead of stacking independent viewport-height calculations.
- Kept Current / Substitute / Confirm Swap and the eligible-card browser reachable on shorter desktop displays.
- Added bounded scrolling to expanded filter controls where required rather than clipping player-management content.
- Added responsive DEF operator layouts for desktop, tablet, and mobile widths.
- No changes to Rules, Milestones, standings, workbook logic, ownership, season eligibility, roster assignment logic, or unrelated UI.

## v1.3.24 — Team Builder Player Drawer Regression Fix

- Corrected the Team Builder Select Player / substitution drawer regression introduced by the v1.3.23 responsive-height changes.
- Preserved the new Fielding Position + DEF comparison operators (`=`, `≠`, `<`, `≤`, `>`, `≥`) in both Cards and Team Builder.
- Restored the proven pre-v1.3.23 Team Builder drawer composition so the filter toolbar remains visible and the CURRENT / SUBSTITUTE comparison area no longer stretches disproportionately.
- Changed short-display handling to scroll the overall Team Builder drawer/workspace rather than clipping controls or forcing the comparison rail to consume the remaining viewport.
- Kept Current, Substitute, Confirm Swap / Add, and eligible-card results reachable on shorter laptop displays.
- Preserved tablet/mobile stacked behavior and independent eligible-card scrolling.
- No changes to Card Database layout, roster assignment logic, ownership, Season Eligible, Rules, Milestones, standings, or workbook-backed data.

## v1.3.25 — Targeted Rules Typography + Team Builder Card Visibility Fix
- Reduced the oversized Rulebook chapter-title typography and tightened its chapter-header spacing without changing Rulebook content or functionality.
- Added responsive chapter-title sizing for normal desktop, condensed desktop, and mobile widths.
- Preserved the successful Team Builder filter/DEF operator layout from v1.3.23/v1.3.24.
- Fixed the Current Player / Substitute comparison stage so both full card images retain their 5:7 aspect ratio and use `object-fit: contain` rather than being clipped by height/overflow constraints.
- Removed the comparison card viewport-height cap as the sizing driver; condensed desktop now relies on the drawer's existing vertical scrolling while keeping full cards visible.
- Added mobile/tablet comparison sizing that preserves full-card visibility without changing swap/add functionality.

## v1.3.26 — Rulebook Source-of-Truth Hierarchy
- Rebuilt the website Rulebook around the original Elements League Rulebook's Roman numeral section order and nested legal-outline hierarchy.
- Restored Sections I–VIII, including the complete Section VII Advanced In-Game Components and Section VIII Player Fatigue & Effects content structure.
- Preserved the original Rulebook wording while retaining the upgraded interactive black/gold digital-manual presentation.

## v1.3.27 — Rulebook Card Examples + Digital Gameplay Review Layer
- Added the provided original card examples to Section III in their source-relative locations: Michael Harris II in III.A, Framber Valdez in III.B, and Evan Phillips + Yadier Molina together in III.C.
- Kept card images uncropped at their original aspect ratios, with readable desktop sizing and responsive single-column stacking on mobile.
- Added a distinct review-only digital gameplay layer without modifying or replacing any official Rulebook text.
- Added blue `Proposed Digital Gameplay Update` callouts for previously discussed decisions: Active Season roster blueprints, automatic lineup visibility, Active Season/year-driven MLB rules, app-based pregame lineup submission/reveal, and locked confirmed offensive/defensive substitutions.
- Added purple `Digital Gameplay Clarification Needed` callouts for unresolved digital execution questions: Pitch/Swing roll handling, official roster source of truth during migration, active-hitter announcements, postgame Discord reporting, RTS/DP/TP/fielding-check automation, and fatigue calculation automation.
- Added a persistent legend explaining that official Rulebook text remains authoritative while colored callouts are review markers for Anthony/James approval, rejection, or revision.
- Preserved the Rulebook's Roman numeral/lettered structure, search, Quick Rules, sticky navigation, Simulated Demos separation, and responsive desktop/mobile behavior.


## v1.3.29 — Milestones Approved Tracker System Rollout
- Preserved the approved Milestone + Reward + Progress + unlabeled claim/status structure.
- Removed redundant milestone status copy, Reward labels, Progress notes, and all claim-area iconography.
- Added the baseball-diamond Progress treatment across Standard, Consistency, Ladder, and Community milestone categories while preserving each category's existing metric and reward data.
- Applied full-color unlocked/active states and cohesive desaturated locked states across each milestone row.
- Added a restrained glowing UNCLAIMED treatment for achieved rewards and a muted LOCKED treatment for unavailable rewards; Prize Pack claiming remains intentionally unimplemented pending approval of that workflow.
- Preserved existing manager progress logic, season phase logic, milestone data, Rules, Team Builder, Cards, and unrelated functionality.
- Added responsive desktop, condensed desktop, tablet, and mobile layouts for the new tracker system.


## v1.3.30 — Milestones Mockup-Faithful Layout Rebuild

- Rebuilt only the Milestones presentation layer using the approved tracker mockup as the desktop visual source of truth.
- Preserved all existing milestone data, manager tracking, category logic, phase logic, rewards, and progress calculations.
- Replaced the inherited legacy row proportions with one shared four-zone grid for **Milestone | Reward | Progress | unlabeled Claim/Status**.
- Added a real aligned header grid so column headings and row content use the same layout definition.
- Rebuilt Progress as one integrated component containing the approved baseball diamond, exact progress values, progress meter, and remaining amount.
- Completed milestones now visually report the milestone threshold as complete (for example 10 / 10) instead of showing overall season GP as 46 / 10.
- Preserved the glowing **UNCLAIMED** treatment and simplified unlabeled Claim/Status area; no Prize Pack or claim backend was added.
- Locked/future milestones remain cohesively desaturated while unlocked milestones remain full color.
- Added deliberate condensed-desktop, tablet, and mobile layouts rather than squeezing the desktop grid.
- No Rules, Cards, Team Builder, Standings, ownership, Season Eligible, or gameplay logic changes.

## v1.3.31 — Milestones Compact Targeted Refinements
- Reduced the Milestones tracker vertical footprint through tighter row heights, padding, plaque sizing, and internal spacing while preserving readability and the approved visual system.
- Removed the redundant `/ target` value from inside the Progress diamond while retaining exact progress elsewhere in the Progress treatment.
- Refined the milestone plaque treatment toward the approved compact framed milestone artwork without changing milestone data or tracking behavior.

## v1.3.32 — Milestones Simplification + Active Row Consolidation
- Removed the Milestones W/L/GP summary from the hero because wins/losses do not affect milestone rewards and games played is already represented by milestone progress.
- Simplified phase cards by removing phase-state/moon-style seals and the Completed / Now Playing / On Deck labels; active phase glow remains the visual state indicator.
- Removed the check/status glyph from inside each Progress diamond and centered the progress number vertically and horizontally.
- Changed the current active achievement into one cohesive blue row treatment, including milestone rail/plaque, Progress, and Claim/Status surfaces, while preserving the existing active glow.
- Consolidated Reward information into the Progress component and removed the standalone Reward content column from milestone rows.
- Removed the redundant exact-progress sentence from the Progress copy; the Progress visual carries the numeric state while the supporting copy now communicates the actual reward.
- Preserved all milestone thresholds, rewards, manager-specific tracking logic, category logic, claim states, and responsive behavior.


## v1.3.33 — Milestones Left-Side Visual Hierarchy
- Preserved the approved milestone plaque, earned-star treatment, baseball diamond, row-state colors, reward text, progress bar, and claim states.
- Clarified the visual jobs: the plaque communicates the milestone target; the diamond communicates achievement/current position/locked state.
- Completed milestone diamonds now use a gold achievement/trophy-style symbol instead of repeating the target number.
- The active milestone diamond continues to show the manager's current progress number.
- Future/locked milestone diamonds now use a muted lock-state symbol instead of repeating progress information.
- Simplified the far-left progression rail into small state-colored journey nodes, removing redundant checkmarks and sequence numbers while preserving the season-progression line.
- Added responsive sizing for the refined rail and diamond state symbols.
## v1.3.34 — Milestones Compact Header + Right-Side Diamond
- Aggressively reduced the Milestones hero/context, phase selector, category navigation, and Next Achievement vertical footprint without changing milestone data or tracking logic.
- Moved the baseball diamond to the far-right edge of each milestone progress treatment.
- Removed the dedicated large Claim/Locked column and integrated claim availability into a compact inline state within the progress/reward area.
- Preserved the glowing UNCLAIMED cue, locked state, milestone plaques, progress bars, active blue row treatment, rewards, and responsive behavior.
- Mobile layout keeps the same information hierarchy without restoring the removed claim column.


## v1.3.36 — Gameplay Phase 1 Engine Foundation
- Added the first centralized Active Season gameplay configuration. Season 10.1 now has one reusable engine blueprint: 1925 rule year, 18-player roster, 4,000-point cap, DH off, Season Eligible required, and MLB timeline rules derived from the configured year.
- Centralized the existing 1925 card/season constant on the new Active Season configuration without changing current Cards or Team Builder behavior.
- Added core gameplay TypeScript state/types for shared PvP games, pregame manager state, frozen roster/card snapshots, inning/score/bases, plate-appearance state, pending decisions, pause/resume state, event types, and the RC1–RC5 rule-condition taxonomy.
- Formalized RC5 as **Conditional Game State**: rules activated by the current state plus the event that just occurred (for example GB/DBP opportunities, RTS, fatigue thresholds, inning transitions, and game-ending conditions).
- Added saved-roster eligibility validation and immutable game-roster snapshot creation so future Games can reuse Team Builder without allowing later Team Builder edits to alter an ongoing game.
- Added game-only pregame selection state for starting pitchers and default-batter declarations; pregame selections become locked once submitted.
- Added pure engine lifecycle helpers for create → pregame → ready → start, state-version checks, and foundational pause/resume that preserves the exact status to resume later.
- Added in-app d20 providers: production random rolls plus an intentionally hidden queued deterministic provider for scenario/regression testing.
- Added a Supabase Phase 1 migration defining participant-only `games` and append-only `game_events` foundations. Direct gameplay updates are intentionally withheld until Phase 2 version-checked RPCs are added.
- Added `src/gameplay/README.md` documenting the engine/source-of-truth rules and Phase 1 acceptance target.
- No public Games UI or gameplay route was activated in this update; `/play` and `/games` remain Coming Soon while the engine foundation is tested.

## v1.3.37 — Gameplay Phase 1A Private Create Game
- Adds a database-enforced private gameplay tester allowlist; the unreleased lab is not available to ordinary managers.
- Adds `/games/lab` as an unlinked private development route.
- Lists claimed managers as test opponents without granting them access to the prototype.
- Reuses existing saved Team Builder rosters and validates them against the centralized Season 10.1 configuration.
- Shows exact roster eligibility/ineligibility reasons before game creation.
- Freezes the selected eligible roster into the game record instead of depending on a mutable Team Builder roster.
- Creates the first persistent private Supabase game record and reloads saved lab games after refresh.
- Does not yet expose opponent roster selection, starting-pitcher/default-batter setup, pregame locking, gameplay rolls, or the visual game board.

## v1.3.38 — Team Builder Two-Way Roster Fix
- Changed roster-size and point-cap enforcement to count unique cards rather than occupied role slots.
- Allows a true two-way card to occupy one hitting/fielding assignment and one pitching assignment without charging its points or roster count twice.
- Removed the incorrect Bench/Bullpen occupied-slot cap that could block legal P5/P6 assignments.
- Added Luther Farrell to the temporary two-way recognition path while the generalized detector was being validated.

## v1.3.39 — Automatic Two-Way Card Detection
- Replaced player-name-based two-way recognition with card-data detection.
- A card qualifies for two-way use only when it contains both a usable hitter side and a usable pitcher side.
- Preserves one unique roster member / one point charge while allowing one hitting/fielding role plus one pitching role across 18/4000, 25/5500, and 26/6000 roster constructions.
- Prevents ordinary one-way cards from using the cross-role exception.

## v1.3.40 — Gameplay Phase 1B Pregame + Two-Way Point Clarity
- Keeps the actual point total on the hitting/fielding assignment for a two-way player and changes the duplicate pitching-side display to `2-WAY`, clarifying that the card is not being charged twice.
- Makes persisted private Gameplay Lab records openable into a game-specific Pregame screen.
- Displays the frozen Team Builder roster snapshot used by the saved game rather than reading a mutable live roster.
- Adds starting-pitcher selection from the frozen starting rotation.
- Adds game-only Default Batter declarations for hitter-capable starters, preserving the underlying Team Builder roster.
- Adds separate Save Selections and Lock My Pregame actions; locked pregame choices become read-only.
- Adds expected-state-version protected private lab persistence plus append-only pregame events in Supabase.
- Keeps the opponent side pending/unavailable in this private one-tester slice; no gameplay board, dice, or public Games access is enabled yet.

## v1.3.41 - Gameplay Phase 1C Pregame Game Lineup
- Adds game-specific batting order and defensive alignment to persisted pregame state.
- Saved Team Builder roster remains frozen/source data; game order/alignment can change without editing it.
- No-DH games require the selected starting pitcher in the nine-player batting order.
- Starting pitcher becomes the game P assignment; two-way identity remains one frozen card.
- Pregame lock now requires a valid game batting order and defensive alignment.

## v1.3.43 — Universal Defensive Assignment Rule
- Makes every frozen-roster card selectable at C, 1B, 2B, 3B, SS, LF, CF, and RF during game-specific pregame alignment.
- Uses the card's printed fielding rating when that position is listed; unlisted non-pitching positions are legal at -10.
- Keeps P restricted to cards with a valid pitcher chart and DH restricted to cards with a valid hitter side.
- Shows the effective fielding rating beside each defender option in the pregame dropdown.
- Prevents one player from occupying two defensive positions simultaneously.
- Validates that the batting order and defensive starters represent the same nine players (with the DH/P distinction handled by active-season DH rules).
- Centralizes the rule in `src/gameplay/defense.ts` so pregame and future in-game substitutions can share the same defensive-assignment logic.

## v1.3.48 — Card source integrity fix
- Replaces the Google Visualization JSON card source with the live CARDS worksheet CSV export.
- Preserves chart cells as strings so single values such as `1` are not dropped in mixed-type columns.
- Adds `npm run audit:cards`, which validates every populated hitter/pitcher chart for exactly one result on each roll 1-20 and never writes to Supabase.
- `npm run import:cards` now runs the same chart validation first and refuses to modify Supabase if any populated chart is malformed.


## v1.3.51 — Build 1 Closing Cleanup
- Prevents Supabase token refreshes/background-tab reactivation from replacing the authenticated app with the full-screen loading gate.
- Keeps route/UI mounted while auth refreshes in the background; authoritative game state remains Supabase-backed.
- Persists/restores per-route scroll position through page lifecycle events without triggering visibility/focus refetches.
- Adds final developer-harness invariant checks for completion, legal final score/inning, outs, duplicate runners, lineup cursors, resolved final state, and post-completion PA safety.
- Keeps all Build 2 manager-decision test policies explicitly development-only.

## v1.3.55 — Build 2 Manual Testing Continuity
- Adds a development-only `Resolve Pending Rule for Test` action for unresolved Rulebook branches so manual Build 2 testing can continue in the same persisted game instead of requiring a restart.
- The bypass uses the existing explicit Build 1 development policy, persists the resulting state through the normal version-checked Supabase save path, and records `developmentOnly: true` / `DEVELOPMENT_TEST_BYPASS` in the game-event payload.
- Implemented Build 2 decision branches are not bypassed; the escape hatch is shown only when the current resolver reports an unfinished informational branch.
- Replaces the text-only BASES status with a responsive live baseball diamond driven directly from authoritative `state.bases`.
- Occupied bases are highlighted and show the runner name; hover/accessibility text exposes runner BSR/SB without changing game state or persistence.

## v1.3.60 — Update 1: Scenario Runner + Non-GB Rulebook Validation
- Added a private deterministic Non-GB Scenario Runner that forces gameplay states/rolls and uses production decision resolvers.
- Added shared Rulebook assertion helpers so production gameplay and deterministic tests use the same natural-roll, BsR-modifier, tag-up, RTS, and catcher-check math.
- Explicitly separated hit extra-base BsR modifiers from tag-up math.
- Encoded the 1B→3B hit-advancement exception, two-out +3, qualifying hit +3, and 1B→2B tag +10 OF modifier.
- Added deterministic coverage for core chart outcomes, extra bases, tag ups, steals, 1B+, bunts, squeeze, intentional walks, INF IN declaration, substitutions, entry attributes, OF rotation, and negative-action checks.
- Ground Ball / Force / DBP remains intentionally deferred to Update 2.

## 1.3.65 — Update 4 Game/Season/Regression Matrix
- Added deterministic game-state boundary validation for inning transitions, regulation endings, ties/extras and walk-offs.
- Added third-out run-counting assertions separating force/batter-runner outs from completed non-force advancement.
- Added MLB timeline boundary checks for 1925, 2020 roster-era baseline, and 2023 automatic extra-inning runner.
- Added multi-mechanic regression checks spanning BsR modifiers, fielding equality/natural overrides, GB checks, fatigue stacking and season configuration.
- Preserved all prior Non-GB, GB/Force/DBP and Fatigue/Pitching matrices as cumulative regression gates.

## v1.3.72 — Basic Playable Game Shell
- Replaced the authenticated `/games` Coming Soon route with a private Games hub for allowlisted gameplay testers.
- Added active-season roster readiness reporting; an active lineup is separately validated against Season 10.1 before being considered gameplay-ready.
- Added `list_gameplay_active_rosters()` as a private gameplay-lab RPC without changing normal lineup RLS.
- Added a basic retro/console playable shell at `/games/lab/:gameId/play` using the certified engine's real pitch, swing, pre-pitch action, manager-decision, confirm, and d20 roll resolvers.
- Kept the developer Gameplay Lab and certification tools intact and separate.
- New-game creation remains disabled until a real opponent active roster validates; existing lab fixtures can be used to test the shell meanwhile.

## v1.3.72 — Basic Playable Game Shell

- Replaced the authenticated `/games` Coming Soon route with a private Games hub for allowlisted gameplay testers.
- Added active-season roster readiness reporting. An active lineup is now separately validated against Season 10.1 (18 players, 4,000-point cap, DH off, Season Eligible cards) before it can be considered gameplay-ready.
- Added `list_gameplay_active_rosters()` as a private gameplay-lab RPC. Existing lineup RLS remains unchanged; only allowlisted gameplay testers can call the helper.
- Added an intentionally basic retro/console playable shell at `/games/lab/:gameId/play` using the certified engine's real pitch, swing, pre-pitch action, manager-decision, confirm, and d20 roll resolvers.
- Kept the developer Gameplay Lab and all certification tools intact and separate from the playable shell.
- Added a direct "Open Playable Shell" path from the existing developer game-state screen.
- New-game creation remains intentionally disabled until a real opponent active roster validates for Season 10.1; existing lab fixtures can be used to test the shell in the meantime.
