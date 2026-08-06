# Cards Page — Unified Position and Defense Rebuild

## Changed

- Position is now the primary fielding-position filter.
- When a fielding position is selected and Attribute Sort is set to Defense, the defense sort automatically uses that position.
- Removed the redundant second defensive-position selection for that case.
- When Position is All, Multi, DH, or P, a defensive-position dropdown appears only when Defense sort needs one.
- Defense Rating appears only while Defense sort is active.
- Moving away from Defense sort clears the hidden defense-rating filter.
- Bats and Arm were consolidated into one compact left-aligned row.

## Test

1. Choose LF under Position.
2. Choose Defense under Attribute Sort.
3. Confirm the interface says it is using LF and does not ask for LF again.
4. Change the defense rating and confirm filtering works.
5. Change Position to CF and confirm Defense automatically uses CF.
6. Choose All under Position and confirm a defensive-position selector appears for Defense sort.
7. Change Attribute Sort away from Defense and confirm the defense controls disappear.
8. Confirm Bats and Arm display compactly in one row.
