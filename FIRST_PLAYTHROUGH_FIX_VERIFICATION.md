# v1.3.74 First Playthrough Fix Verification

1. No Wheel terminology: `SAC_BUNT_DEFENSE` now displays **No Wheel** / **Wheel Play**.
2. Automatic pitcher advantage: pre-pitch guaranteed pitcher ADV uses **NO PITCH — PITCHER ADVANTAGE** and proceeds directly to Swing.
3. Default batter attributes: shell and pitch resolver both use effective OB 5 when Default Attributes are active.
4. Failed no-wheel bunt: rolls 1-2 resume the PA on the pitcher chart and the shell reports the failed bunt / pitcher-chart re-roll.
5. Extra-base BsR: hit advancement uses the authoritative modifier helper; going home plus two outs stacks to +6 where applicable, and the effective target is displayed.
6. Single throw target: one selected extra-base runner bypasses the redundant defensive target-selection screen.
7. BB advancement: only forced runners advance; runners without a continuous force hold.
8. Shutout Bonus: 7.33 IP is 22 outs; subsequent shutout outs cost -1 Control, a run after SOB immediately costs -2, and later outs cost -2. Shell and pitch math use the same effective Control.
9. 2B/3B GB with INF IN off: batter out at 1B and 3B runner score are applied before **RTH**; runner from 2B then uses 1-10 advance / 11-20 hold.
10. Standard DBP: lead-force and batter-at-1B checks remain independent; regression case 13+9 > BSR14 is out at 2B while 2+9 < BSR15 is safe at 1B.

Runtime source note: stale compiled gameplay `.js` twins were removed so Vite cannot shadow the corrected TypeScript modules.
