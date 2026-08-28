import { benchCards } from '../decisionEngine'
import type { GameCardSnapshot, GameSide, GameState } from '../types'

/**
 * Who a manager can still bring in, split for display.
 *
 * The "who is still available" rule is the engine's, via the now-exported
 * `benchCards` -- this file used to restate it from public state, which was a
 * second copy that could drift. A UI that offers an ineligible substitute is a
 * UI that lies, so it asks rather than guesses.
 *
 * All that remains here is presentation: splitting the same list into the
 * bullpen and the bench.
 */

export type Availability = {
  /** Cards with a Control rating -- the bullpen. */
  bullpen: GameCardSnapshot[]
  /** Everyone else still unused -- position players on the bench. */
  bench: GameCardSnapshot[]
}

export function availableFor(state: GameState, side: GameSide): Availability {
  const unused = benchCards(state, side)
  return {
    bullpen: unused.filter((c) => c.pitcher.control !== null),
    bench: unused.filter((c) => c.pitcher.control === null),
  }
}
