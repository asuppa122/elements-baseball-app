# v1.3.75 Game 2 targeted correction

## Game 2 status of original 10
1. No Wheel — retained in decision UI; verify manually.
2. NO PITCH — expanded so minimum-roll ties that resolve to pitcher by handedness also skip pitch (C5R vs OB6R).
3. Default OB5 — previously passed; regression preserve.
4. Failed bunt pitcher-chart messaging — code present; targeted manual verification still required.
5. Extra-base +3 Home / +3 two-outs BSR — code present; targeted manual verification still required.
6. Single legal throw target auto-selection — code present; targeted manual verification still required.
7. BB force-only advancement — previously passed; regression preserve.
8. SOB — corrected threshold timing: the out completing card IP is the first -1; once a run breaks SOB, immediate -2 and -2 per subsequent out.
9. 2B/3B GB with INF IN off — retained dedicated GB_RUNNER_2B_RTH path; verify manually.
10. Independent DBP checks — previously passed; regression preserve.

Do not treat a successful build as manual verification of #1/#4/#5/#6/#9.
