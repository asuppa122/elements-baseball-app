# Public Demo Mode Update

- Added a public, no-login demo at `/demo`.
- Demo routes reuse the existing Home, Cards, Card Profile, Lineup Builder, and Coming Soon pages.
- Added a prepared sample lineup for the demo Lineup Builder.
- Demo substitutions, filters, DH toggles, and rearranging stay in memory only.
- All persistent lineup writes are bypassed in demo mode.
- Save displays `Demo — Not Saved` and confirms that demo changes are not saved.
- Manager claiming, lineup creation, deletion, and logout controls are not shown in demo mode.
- Added a visible `Demo Mode / Public Preview / Changes are not saved` indicator.

Shareable route after deployment:

https://elements-baseball.vercel.app/demo
