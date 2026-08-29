# screen-v1 — gameplay screen mockup

Tagged `screen-v1`. Restore with:

    git show screen-v1:.design-mockup/screen-v1.html > public/_proposal.html

Four states, all built from game `0c37ba41` rather than constructed values:
resting, the reveal, decision pending (tag-up), bases loaded. Tabs are live
(Now / Log / Bullpen / Bench) and the card-drag tool is attached.

## What this version settles

- **Centre box** — as frozen in `CENTRE_BOX_SPEC.md`, on `gameplay-field-v2.webp`.
- **Lineup state** — a runner's card takes a 2px gold outline (offset 2px) and a
  base label; a hitter out this inning takes the same outline in red with `OUT`.
  Outline, not glow: the glow read as too soft and the two warm colours bled
  into each other. The order-number badge stays neutral in both states.
- **Pitcher status** — `IP LEFT` and `CONTROL` above the pitcher card. Control
  is the *current* effective value from `effectivePitcherControl`, not the
  printed one, so every fatigue effect lands in the same number.

  No shutout-bonus badge. It went through Intact/Broken, then Live/Lost, then a
  green/red indicator light, and all three were wrong for the same reason: no
  other fatigue effect gets called out, they just move Control. Singling this
  one out told the manager it was a different kind of thing than it is.

## Known open questions carried past this version

- When Control has moved off printed, the tile can carry a quiet `from 5`. Not
  wired into the four states, because at this moment in the game nothing has
  moved it — all three penalties are zero (rested, under 4 earned runs, 2 outs
  into a 22-out card), so the honest value is the printed 5.
- Gold marks both the at-bat hero and every runner. Distinguished today by size
  and position in the rail, not by hue.
- The 2B runner slot is shared by a runner standing on the bag and a runner in
  motion mid tag-up.
- The midslot is 129 px, the tightest column constraint; a long outcome line
  will crowd it.
