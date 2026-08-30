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

## Scaling model — Type 2, proportional

The desktop board **scales as one locked unit**; it does not reflow. Every
dimension is a fraction of the stage height, so the whole composition grows and
shrinks together and nothing moves relative to anything else.

Mechanism: `.stagewrap` is a `container-type: size` element wrapping the screen,
and `.screen` declares `--u: 1cqh` through a registered `@property`. Because a
registered property computes at its declaration site, `--u` resolves once
against the stage and is inherited as a fixed length — the field's own nested
containers cannot capture it. Every value is then `calc(var(--u) * N)` where
`N = design_px / 1130 * 100`.

The design height is **1130**, the viewport the baseline was locked at. At
1920 x 1130 the board renders the locked values exactly.

Verified constant across sizes — the ratios do not move:

| viewport | matchup card | card h / stage h | left rail | rail / stage h |
|---|---|---|---|---|
| 1280 x 720  | 133.8 x 188   | 0.2611 | 369.5 | 0.5133 |
| 1600 x 900  | 167.3 x 235   | 0.2611 | 461.9 | 0.5133 |
| 1920 x 1130 | 210 x 295     | 0.2611 | 580   | 0.5133 |
| 2560 x 1440 | 267.6 x 375.9 | 0.2611 | 739.1 | 0.5133 |

### Two accepted impurities

**Text has a legibility floor.** Every font size is
`max(<floor>px, calc(var(--u) * N))`. Pure scaling would make the recap, log
and bullpen rows unreadable on a short window. ERA avoids this only because its
board is nearly text-free; ours is not. Legibility wins over purity.

**The field stops growing at 1100px.** The raster is 1508 x 1043, so beyond
that cap it would upscale past ~1.46x at DPR 2 and the white foul lines soften
before the grass does. Above roughly 2100px of stage height the field therefore
holds still while everything else keeps scaling — a visible imperfection,
accepted for now.

> **The task that fully closes this:** a higher-resolution field export, about
> 3000 x 2076, or a vector field. That lifts the DPR-2 ceiling to 1500 CSS px
> and lets the cap rise or disappear, making the scaling uniform at every size.
> Not a blocker; tracked here as the real fix.

## Field art

`public/gameplay-field-v3.webp`, 1508 × 1043. At the locked layout the field
renders 1018 wide, which is a **1.35× upscale at DPR 2**. See the responsive
plan for the cap.
