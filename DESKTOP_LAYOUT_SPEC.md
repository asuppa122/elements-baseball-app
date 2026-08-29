# Gameplay screen — desktop layout (LOCKED)

Locked 2026-08-29 from the in-page layout editor on `.design-mockup/gameplay-desktop.html`.
These are the **design proportions**. Responsive behaviour scales and reflows from
here; it does not replace them.

Reference viewport when these were set: **~1920 × 1130**. At that size the left
rail fits exactly (1016/1016).

## Structure

```
screen
├── top            full-width header, 90px
└── main
    ├── lrail      580   scorebug lives in the header; rail holds the game
    │   ├── man            batter card + meta tiles
    │   ├── rollrow        ROLL PITCH + pitch/swing/result readout
    │   ├── man            pitcher card + meta tiles
    │   ├── order          batting order 1-9
    │   └── calls          manager decisions
    ├── fcol       fills   field + DEF strip beneath it
    └── rrail      290    game log / bullpen / bench accordion
```

## Locked values

| element | value |
|---|---|
| left rail | **580** |
| right rail | **290** |
| header | **90** |
| matchup card | **210 × 295** |
| meta tiles column | **160** |
| roll row | **60** |
| lineup card | **50 × 70** (hero ×1.22) |
| decisions box | **46** min |
| fielder card | **10.0cqw** of the field's inner width |

## Locked fielder positions

Percent of `.finner`, centre of the card.

| | left | top |
|---|---|---|
| LF | 26.5 | 14.5 |
| CF | 50.5 | 11.0 |
| RF | 73.5 | 15.0 |
| SS | 38.5 | 33.0 |
| 2B | 61.5 | 33.0 |
| 3B | 25.5 | 40.5 |
| 1B | 74.5 | 40.5 |
| C  | 50.5 | 87.8 |

## Known constraint

The left rail is **height-bound**, not width-bound. Its content is a fixed stack:

```
2 × (card 295 + 14 padding) + roll 60 + order 82 + decisions 46 + gaps 28  =  834
```

At 1920 × 1130 the rail has 1016px and fits. At **1400 × 800 it has 686px and
overflows by ~148**. This is the single fact that drives the responsive work:
the rail contents must scale with viewport height, or the layout only works on
a large monitor.

## Field art

`public/gameplay-field-v3.webp`, 1508 × 1043. At the locked layout the field
renders 1018 wide, which is a **1.35× upscale at DPR 2**. See the responsive
plan for the cap.
