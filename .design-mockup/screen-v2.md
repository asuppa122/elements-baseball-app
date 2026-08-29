# screen-v2 — gameplay screen mockup

Tagged `screen-v2`. Restore with:

    git show screen-v2:.design-mockup/screen-v2.html > public/_proposal.html

Previous version: `screen-v1` (see `.design-mockup/screen-v1.md`).

## Changes from v1

- `IP LEFT` and `CONTROL` values are white (`--cream`) rather than pitcher
  orange. They are neutral state, not a warning.
- The coloured ring around the batter and pitcher cards in the matchup box is
  gone — gold on the batter, orange on the pitcher. The cards carry their own
  printed frame; the app frame on top of it was doing nothing the position in
  the column did not already say. Drop shadow retained for depth.

## What this version holds

- **Centre box** — as frozen in `CENTRE_BOX_SPEC.md`, on `gameplay-field-v2.webp`.
- **Lineup state** — a runner's card takes a 2px gold outline (offset 2px) plus a
  base label; a hitter out this inning takes the same in red with `OUT`. The
  order-number badge stays neutral in both.
- **Pitcher status** — `IP LEFT` and `CONTROL` above the pitcher card, Control
  being the current effective value from `effectivePitcherControl`. No
  shutout-bonus badge: no other fatigue effect gets one, they all just move
  Control.
- Four states, all from game `0c37ba41`: resting, the reveal, decision pending
  (tag-up), bases loaded. Live tabs and the card-drag tool attached.

## Open questions carried forward

- Whether the `from 5` cue under a reduced Control is wanted. Not visible in the
  four states, because nothing has moved Control at this moment in the game.
- Gold marks both the at-bat hero and every runner in the rail, distinguished by
  size and position rather than hue.
- The 2B runner slot is shared by a runner on the bag and one in motion mid tag-up.
- The midslot is 129 px, the tightest column constraint.
