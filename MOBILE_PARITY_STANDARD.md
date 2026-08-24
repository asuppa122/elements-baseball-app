# Elements Baseball — Mobile Parity Standard

Mobile is a first-class version of Elements Baseball. Every meaningful product update must be verified on desktop and mobile before it is considered complete.

The invariant is **same content + same functionality + same visual capability + same design intent**. Responsive breakpoints may reflow or restructure layouts; they must not simply shrink desktop components until they technically fit.

## Required QA widths

- Normal desktop
- Condensed desktop
- Tablet
- 390–430px phone widths
- Narrower phones where practical

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
