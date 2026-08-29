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
- **Shutout bonus** — an indicator light, green lit / red lit, under the label
  `SHUTOUT BONUS`, sitting above the pitcher card alongside `IP LEFT`.
  Replaces the earlier Intact/Broken and Live/Lost wordings.

## Known open questions carried past this version

- The light is colour-only. Green and red at 13px is legible for most people but
  carries no redundant cue — a shape difference (filled vs hollow) or a micro
  label would make it read without colour.
- Gold marks both the at-bat hero and every runner. Distinguished today by size
  and position in the rail, not by hue.
- The 2B runner slot is shared by a runner standing on the bag and a runner in
  motion mid tag-up.
- The midslot is 129 px, the tightest column constraint; a long outcome line
  will crowd it.
