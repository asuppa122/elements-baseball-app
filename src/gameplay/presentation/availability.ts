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
 * What is left here is presentation: splitting that list into bullpen and
 * bench, and ordering it the way the manager built his roster. benchCards
 * walks the snapshot's card map, whose order is incidental -- Will read it as
 * random in the first live game. The Team Builder slots (bullpen-1, -2 ...,
 * rotation-1 ..., bench-1 ...) are the manager's own order, so that is the
 * order shown, and it never changes as players are used.
 */

export type Availability = {
  /** Cards with a Control rating -- the bullpen. */
  bullpen: GameCardSnapshot[]
  /** Everyone else still unused -- position players on the bench. */
  bench: GameCardSnapshot[]
}

const SLOT_GROUPS: Array<{ prefix: string; tag: string }> = [
  { prefix: 'bullpen-', tag: 'RP' },
  { prefix: 'rotation-', tag: 'SP' },
  { prefix: 'bench-', tag: 'BN' },
  { prefix: 'lineup-', tag: '#' },
  { prefix: 'defense-', tag: '' },
]

/** The card's Team Builder slot: a sort key and a short label (RP2, SP4, BN1). */
export function rosterSlot(state: GameState, side: GameSide, cardKey: string): { rank: number; label: string | null } {
  const assignments = state.pregame[side].roster?.assignments ?? {}
  let best: { rank: number; label: string | null } = { rank: Number.MAX_SAFE_INTEGER, label: null }
  for (const [slotId, key] of Object.entries(assignments)) {
    if (key !== cardKey) continue
    const group = SLOT_GROUPS.findIndex((g) => slotId.startsWith(g.prefix))
    if (group < 0) continue
    const n = Number(slotId.slice(SLOT_GROUPS[group].prefix.length)) || 0
    const rank = group * 1000 + n
    if (rank < best.rank) best = { rank, label: group <= 2 ? `${SLOT_GROUPS[group].tag}${n}` : null }
  }
  return best
}

function ordered(state: GameState, side: GameSide, cards: GameCardSnapshot[]): GameCardSnapshot[] {
  return [...cards].sort((a, b) =>
    rosterSlot(state, side, a.cardKey).rank - rosterSlot(state, side, b.cardKey).rank
    || a.playerName.localeCompare(b.playerName))
}

export function availableFor(state: GameState, side: GameSide): Availability {
  const unused = benchCards(state, side)
  return {
    bullpen: ordered(state, side, unused.filter((c) => c.pitcher.control !== null)),
    bench: ordered(state, side, unused.filter((c) => c.pitcher.control === null)),
  }
}
