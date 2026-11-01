import { confirmManagerDecision, getDecisionView, resolveDecisionRoll } from '../decisionEngine'
import { resolvePitchRoll, resolveSwingRoll } from '../engine'
import { startPlayLog } from '../playLog'
import type { GameState } from '../types'

/**
 * Sandbox only: rules-v2 versions of a saved state, so the play log, the live
 * game lines and the box score can be reviewed with no account. The play log
 * starts at the given moment (earlier innings are not part of it).
 */
export function asRecordedGame(source: GameState): GameState {
  const s = structuredClone(source)
  s.rulesVersion = 2
  return startPlayLog(s)
}

/**
 * Plays a recorded game to the end with a seeded die and the first legal
 * choice at every decision -- deterministic, so the review always shows the
 * same finished box score. Every roll goes through the production resolvers.
 */
export function playRecordedGameToEnd(source: GameState, seed = 20261101): GameState {
  let x = seed >>> 0
  const d20 = () => { x = (x * 1664525 + 1013904223) >>> 0; return (x % 20) + 1 }
  let s = asRecordedGame(source)
  s.turnHandshake = undefined
  for (let guard = 0; guard < 2000 && s.status !== 'complete'; guard++) {
    if (s.status === 'awaiting_decision') {
      const view = getDecisionView(s)
      if (!view) break
      s = view.mode === 'roll' ? resolveDecisionRoll(s, d20()) : confirmManagerDecision(s, [view.options[0].id])
    } else if (s.waitingFor === 'PITCH_ROLL') {
      s = resolvePitchRoll({ ...s, nextActor: s.half === 'top' ? 'home' : 'away' }, d20())
    } else if (s.waitingFor === 'SWING_ROLL') {
      s = resolveSwingRoll(s, d20())
    } else break
  }
  return s
}
