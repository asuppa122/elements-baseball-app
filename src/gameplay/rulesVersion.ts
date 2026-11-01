import type { GameState } from './types'

/**
 * Gameplay rules a game is played under, frozen when it is created.
 *
 * 1 -- everything before Anthony's decisions of 2026-11-01. Games created
 *      under it (absent `rulesVersion`) finish under it: no mid-game change.
 * 2 -- the 2026-11-01 decisions: walk-offs end at the winning run (OBR 7.01(g),
 *      5.08), runs charged to the responsible pitcher for fatigue (Shutout
 *      Bonus Option B), the squeeze fixes (D1, D8), the manager-action lock
 *      after any resolved steal, Infield In with any runner on and < 2 out,
 *      the Shutout Bonus never restoring Control (D10), and the play log.
 */
export const CURRENT_RULES_VERSION = 2

export function rulesVersionOf(state: Pick<GameState, 'rulesVersion'>): number {
  return state.rulesVersion ?? 1
}

export function usesRulesV2(state: Pick<GameState, 'rulesVersion'>): boolean {
  return rulesVersionOf(state) >= 2
}
