# Gameplay mockup generator

`gs.py` emits every desktop gameplay artboard. Run it from `Project/`:

```bash
python3 .design-mockup/generator/gs.py
```

It writes four artboards to `.design-mockup/` and mirrors them into
`public/` so the dev server can serve them:

| artboard | served at |
|---|---|
| `gameplay-desktop.html` | `/_desktop.html` |
| `gameplay-desktop-bullpen.html` | `/_desktop-bullpen.html` |
| `gameplay-desktop-half.html` | `/_desktop-half.html` |
| `gameplay-desktop-final.html` | `/_desktop-final.html` |

`editor.py` holds the in-page layout editor injected into `_desktop.html`
only (sliders plus fielder drag). It is a design tool, not shipped UI.

## These are mockups, not the app

Nothing here is wired to the engine. The live React screen is
`src/pages/GameplayScreenPage.tsx` at `/games/lab/:gameId/screen`, and as
of this commit it does NOT implement the design in these artboards — it is
still Type 1 reflow. Implementing these into React is separate, unstarted work.

## State shown

Board state is real, read from persisted lab games, never invented:

- `PARITY` — game `0c37ba41` at V16: top 1st, 2 outs, 1-0, Shackelford on
  first via a walk, Aurilia batting against Nelson Dean.
- `SIXTH` — game `da3b3772` at the end of the bottom of the 6th: Anthony
  leads 5-0, Tristan Gray grounds out. Used by the half-inning artboard.
- The recap is derived from all 159 events of game `da3b3772`
  (final 5-1), including both box scores and all 66 plays.

Header state is per-artboard so a single frame can never show two
different moments at once.

## Editing

Change values in `gs.py` and re-run; do not hand-edit the generated HTML,
it is overwritten. To change real game values, re-read them from the lab
state route rather than typing them in.
