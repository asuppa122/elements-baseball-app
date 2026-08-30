# Elements Baseball — Mobile Parity Standard

Mobile is a first-class version of Elements Baseball. Every meaningful product
update must be verified on desktop and mobile before it is considered complete.

## The principle

**Mobile must include everything desktop has access to** — every piece of
information, every action, every decision. Nothing removed, nothing dumbed
down, nothing desktop-only.

**How it is presented is a separate question.** Mobile should use whatever
layout and interaction pattern works best for a phone, which may be nothing
like desktop's arrangement. Tabs, bottom sheets, progressive disclosure,
accordions, tap-to-expand — all fine, all encouraged where they serve mobile
better.

Parity is about **capability and access**, not identical layout.

### The test

> Can a mobile user reach every capability and every piece of information a
> desktop user can?

That is the question. **Not** "does mobile look like desktop, shrunk?"

A feature passes if it is reachable, legible and operable on a phone. It fails
if it is missing, unreachable, or present but unusable — a control too small to
tap, a decision with no surface to resolve it, information that exists only in
a desktop-width panel.

### What this supersedes

This replaces the earlier framing: *"same content + same functionality + same
visual capability + same design intent; reflow or restructure, do not shrink."*

That was directionally right and its anti-shrinking instinct still holds, but
it was too rigid. Read strictly, "same visual capability and design intent"
implied mobile owed desktop a matching arrangement, which created a false
tension between *everything desktop has* and *works on a phone*. It does not.
Reorganising for the phone is the point, not a compromise.

The anti-shrinking rule survives in full: **never shrink desktop components
until they technically fit.** Reorganise instead.

### Worked example — the gameplay screen

Desktop is three columns: matchup rail, field, accordion rail. On a phone that
becomes five tabs — Matchup, Field, Log, Bullpen, Bench — with blocking
decisions as a bottom sheet over whichever tab is showing.

Nothing is cut. The layout has almost nothing in common with desktop. That is
a pass, because every panel keeps its content and every control stays
operable at touch size.

Where it would fail: if the bullpen were desktop-only, if a ground-ball
resolution had no mobile surface, or if `Send him` / `Hold` rendered below a
44px touch target.

## Required QA widths

- Normal desktop
- Condensed desktop
- Tablet
- 390–430px phone widths
- Narrower phones where practical

Verify the widths *between* breakpoints too, not just the extremes. A layout
can be correct at 390 and at 1920 and broken across the whole band in between.

## Touch targets

Anything tappable is at least **44 × 44** on a phone. This applies with force
to decision controls, where a mis-tap changes the game state.

## Team Builder acceptance criteria

- Every roster mutation autosaves to Supabase.
- Autosave shows `Saving…` then `Saved`; errors are visible and retryable.
- Navigation warns only when a save actually failed or is still unresolved.
- Mobile selection drawers own touch scrolling; the background page does not move.
- Player card art, projection, roster-limit state, and Add action remain readable and tappable.
- A queued Add/Swap exposes a sticky confirmation action.
- Roster/DH settings have an obvious dropdown affordance on phones.
- Season Eligible filters to the current manager (`source_yes_field = yes` or that manager; current-season cards retain existing eligibility behavior).
- Desktop behavior must not regress.
