# Gameplay Verification Framework — v1.3.76

The same Rulebook examples now serve four layers:

1. **Automated test** — production helpers/resolvers assert the expected result.
2. **Interactive demo** — developer verification page steps through the scenario on demand or as a loop.
3. **Rules demo** — the same component is embedded in the digital Rules section for new-player teaching.
4. **Full-game testing** — normal games confirm the mechanic interacts correctly with all surrounding state.

## Original 10 scenarios
1. No Wheel defensive terminology.
2. NO PITCH automatic pitcher advantage, including OB5/C5 and OB6R/C5R.
3. Default-chart OB5, while normal printed cards retain their printed OB.
4. No-Wheel sacrifice-bunt table and failed-bunt pitcher-chart messaging.
5. Hit advancement +3 Home +3 two outs = +6.
6. Automatic throw target when only one legal extra-base target exists.
7. BB force-only advancement.
8. Shut Out Bonus control progression.
9. GB runners 2B/3B, INF IN off, automatic out/run then RTH.
10. Independent DBP base checks.

## No-Wheel sacrifice bunt table
- 1: Failed bunt — attempt swing on pitcher chart.
- 2: Failed bunt — attempt swing on pitcher chart.
- 3: K.
- 4: K.
- 5: Lead runner out.
- 6-20: Bunt successful; runners advance.

Do not call a mechanic verified solely because the app builds. Automated assertions, the manager-facing demo, and eventually a normal full-game occurrence are separate gates.
