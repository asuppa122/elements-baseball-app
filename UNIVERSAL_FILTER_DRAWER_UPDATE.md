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
