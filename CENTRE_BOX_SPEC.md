# Gameplay screen — centre box (LOCKED)

Locked 2026-08-28. These are the live choices for the centre box. The left and
right rails are **not** locked — those are the next session's work.

Reference mockup: `.design-mockup/centre-box-v7.html`
(served during design from `public/_proposal.html`, which is deliberately
untracked — it must never be committed into `public/`, that directory deploys).

## Base image

`public/gameplay-field-v2.webp` — 1153 × 1364 (aspect **0.8453**), 254 KB.

Re-encoded from a 2597 KB original with `sharp` at `webp({quality:84, effort:6})`.
Quality ladder if it ever needs revisiting: q90 = 412 KB, q84 = 254 KB, q78 = 180 KB.

The image carries real foul territory behind home plate, so the previous
synthetic-turf workaround (a `--turf` background band, a `hem` seam gradient and
a 93%-height art layer) is **deleted** and must not come back.

## Layout

```
centre (922 px wide at 1400 px screen)
└── arena            grid: minmax(0,1fr) / 220px, gap 10, full column height
    ├── fieldcol
    │   └── field            654 × 774, position:relative, overflow:hidden
    │       ├── fieldinner   height:100%, aspect-ratio:1153/1364, centred
    │       │                → every % coordinate below is relative to THIS
    │       └── defstrip     absolute bottom, gradient to rgba(7,8,9,.34)
    └── duelcol       batter box / midslot / pitcher box
```

Crop at 1400 px is effectively zero (the inner is ~1 px wider than the field's
content box). `fieldinner` is sized off **height**, so a narrower window crops
the sides — LF and RF are the first cards to lose an edge.

## Card positions (percent of `.fieldinner`, centre of the element)

Card art **90 × 126 px**, no name or position label — the art carries identity.

| id | left | top |
|---|---|---|
| LF | 15.5 | 17.0 |
| CF | 50.0 | 10.8 |
| RF | 84.0 | 17.0 |
| SS | 36.0 | 28.8 |
| 2B | 64.0 | 28.8 |
| 3B | 17.7 | 37.9 |
| 1B | 81.8 | 37.9 |
| C  | 50.0 | 85.3 |
| ROLL | 50.0 | 59.5 |
| RUN@1B | 80.0 | 56.0 |
| RUN@2B | 50.0 | 39.5 |
| RUN@3B | 21.0 | 56.0 |

Verified at 1400 px: no element is clipped by the field edge or the DEF strip,
and no two elements overlap, including with the bases loaded.

Detected base centres in this image (for any future re-mapping):
2B 49.78/35.85 · 1B 79.27/52.27 · 3B 20.56/52.27 · HOME 49.96/74.63

## Runner tags

`<b>{initial}. {Surname}</b>` over `BsR {n} · SB {n}`.

**Only 3 of 14 hitters on this roster carry a stolenBase value** (Aurilia 19,
Thomasson 17, Griffey 17); the rest are `null`. The tag renders those as an
em dash. Do not fabricate a number, and do not hide the SB half when it is
empty — the empty state is the common case.

One slot per base, shared by whoever occupies it. Open question carried
forward: a runner *in motion* (mid tag-up) currently reuses the same 2B slot as
a runner standing on the bag. If those should differ, that is a second slot.

## Duel column (220 px)

- batter box and pitcher box: card `max-width:192px`, aspect 820/1150, so 192 × 269
- eyebrow only (`AT BAT` / `PITCHING`) — no name, position, bats, OB or control,
  all of which the card art already prints
- under the pitcher: `IP LEFT` and `SHUTOUT` tiles
- **midslot** between them, a 3-row grid: roll numbers / advantage pill / outcome.
  Roll numbers and outcome stay populated through a pending decision and only
  clear when the play resolves.
- midslot is 129 px at this sizing — the tightest constraint in the column, and
  the thing that gives if the batter/pitcher cards grow again.

## Roll button

On the grass, below the mound, inside `.fieldinner` so it shares one coordinate
space with the cards. 158 × 42, gold. Becomes `RESOLVING…` while the pitch
resolves and `AWAITING YOUR CALL` while a manager decision is open.
