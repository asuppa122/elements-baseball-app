import type { GameCardSnapshot, GameSide, GameState } from '../types'

/**
 * Who a manager can still bring in.
 *
 * NOTE — this restates a rule that lives privately in decisionEngine.ts as
 * `benchCards`: everyone on the frozen roster who is not in `appearedCardKeys`
 * (falling back to the starting lineup plus alignment for games saved before
 * that field existed). It reads only public state and calls nothing in the
 * engine, which keeps this work inside the additive boundary -- but it IS a
 * second copy of a rule, and the two could drift.
 *
 * Flagged for review: `benchCards` should be exported from decisionEngine and
 * this file deleted, exactly as `getFieldingRating` already is in defense.ts.
 * That is a one-line engine change and so deliberately not made here.
 */

function usedCardKeys(state: GameState, side: GameSide): Set<string> {
  const explicit = state.appearedCardKeys?.[side]
  if (explicit) return new Set(explicit)
  const pregame = state.pregame[side]
  return new Set([
    ...pregame.battingOrderCardKeys,
    ...(Object.values(pregame.defensiveAlignment).filter(Boolean) as string[]),
  ])
}

export type Availability = {
  /** Cards with a Control rating -- the bullpen. */
  bullpen: GameCardSnapshot[]
  /** Everyone else still unused -- position players on the bench. */
  bench: GameCardSnapshot[]
}

export function availableFor(state: GameState, side: GameSide): Availability {
  const roster = state.pregame[side].roster
  if (!roster) return { bullpen: [], bench: [] }
  const used = usedCardKeys(state, side)
  const unused = Object.values(roster.cards).filter((c) => !used.has(c.cardKey))
  return {
    bullpen: unused.filter((c) => c.pitcher.control !== null),
    bench: unused.filter((c) => c.pitcher.control === null),
  }
}
