/**
 * Handedness as managers say it: RHB / LHB / SHB for hitters, RHP / LHP for
 * pitchers. Read from the card snapshot; anything not recorded shows nothing
 * rather than a guess.
 */
export function batsLabel(bats: string | null | undefined): string | null {
  const b = bats?.trim().toUpperCase()
  if (b === 'R') return 'RHB'
  if (b === 'L') return 'LHB'
  if (b === 'S' || b === 'B' || b === 'SW') return 'SHB'
  return null
}

export function throwsLabel(arm: string | null | undefined): string | null {
  const a = arm?.trim().toUpperCase()
  if (a === 'R') return 'RHP'
  if (a === 'L') return 'LHP'
  return null
}
