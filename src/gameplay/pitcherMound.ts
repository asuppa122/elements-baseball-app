import { defensiveOutsRecorded } from './engine'
import { pitcherInstanceKey, readPitcherStateValue } from './pitcherStateKey'
import type { GameSide, GameState, PitcherStint } from './types'

/**
 * Who is on the mound, and what that costs him -- the bookkeeping every way a
 * pitcher arrives or leaves goes through (pitching change, double switch,
 * moving a fielder to P).
 *
 * Two rules from MLB 5.10, adopted by Anthony on 2026-10-30 for Elements:
 *
 * - 5.10(d) Comment: a pitcher moved to a field position stays in the game and
 *   may come back to pitch, but may move from P to another position only once
 *   per inning. He keeps ONE pitching line: outs, runs and fatigue continue
 *   from his first stint. That is done by sliding his entry out-count forward
 *   by the outs he spent off the mound, so every reader of
 *   pitcherEntryDefenseOuts (live fatigue, the Shutout Bonus, the box score)
 *   keeps working unchanged.
 *
 * - 5.10(g): every pitcher, starter or reliever, must face three batters
 *   (each to a completed plate appearance) or finish the half-inning. If the
 *   half ends first he may be removed between innings; if he comes back out
 *   he owes the rest of the three. The injury exception has no digital
 *   equivalent.
 */

export function halfKey(state: Pick<GameState, 'inning' | 'half'>): string {
  return `${state.inning}-${state.half}`
}

/** The starters' stints, set when the game starts. */
export function openingStints(state: GameState): Partial<Record<GameSide, PitcherStint>> {
  const stints: Partial<Record<GameSide, PitcherStint>> = {}
  for (const side of ['home', 'away'] as GameSide[]) {
    const key = state.pregame[side].startingPitcherCardKey
    if (key) stints[side] = { cardKey: key, battersFaced: 0, halfKey: null }
  }
  return stints
}

/**
 * Batters a side's pitcher still owes before he may leave the mound, or null
 * when he is free to go. Games without stint tracking carry no minimum.
 */
export function threeBatterMinimum(state: GameState, side: GameSide): { cardKey: string; playerName: string; remaining: number } | null {
  const stint = state.pitcherStint?.[side]
  const onMound = state.pregame[side].defensiveAlignment.P
  if (!stint || !onMound || stint.cardKey !== onMound) return null
  if (stint.battersFaced >= 3) return null
  // The half he last pitched in is over and he has not faced anyone since:
  // between innings, he may be removed.
  if (stint.halfKey !== null && stint.halfKey !== halfKey(state)) return null
  return {
    cardKey: stint.cardKey,
    playerName: state.pregame[side].roster?.cards[stint.cardKey]?.playerName ?? stint.cardKey,
    remaining: 3 - stint.battersFaced,
  }
}

/** A completed plate appearance counts toward the pitcher's three batters. */
export function recordBatterFaced(state: GameState, side: GameSide, pitcherKey: string | null): GameState {
  const stint = state.pitcherStint?.[side]
  if (!stint || !pitcherKey || stint.cardKey !== pitcherKey) return state
  return { ...state, pitcherStint: { ...state.pitcherStint, [side]: { ...stint, battersFaced: stint.battersFaced + 1, halfKey: halfKey(state) } } }
}

/** Has this pitcher already pitched for this side today? */
export function hasPitched(state: GameState, side: GameSide, cardKey: string): boolean {
  return state.pregame[side].startingPitcherCardKey === cardKey
    || readPitcherStateValue(state.pitcherEntryDefenseOuts, side, cardKey) !== undefined
}

/**
 * Puts `incoming` on the mound in place of `outgoing`. The alignment itself is
 * the caller's; this records the exit, the entry (continuing a returning
 * pitcher's line), the new stint and the plate appearance's pitcher.
 */
export function changePitcher(state: GameState, side: GameSide, outgoing: string | null | undefined, incoming: string): GameState {
  const outs = defensiveOutsRecorded(state, side)
  const exit = { ...(state.pitcherExitDefenseOuts ?? {}) }
  const entry = { ...(state.pitcherEntryDefenseOuts ?? {}) }
  const runs = { ...(state.pitcherRunsAllowed ?? {}) }
  if (outgoing) exit[pitcherInstanceKey(side, outgoing)] = outs

  const scoped = pitcherInstanceKey(side, incoming)
  if (hasPitched(state, side, incoming)) {
    // A return: slide his entry forward by the outs he spent off the mound.
    const firstEntry = readPitcherStateValue(state.pitcherEntryDefenseOuts, side, incoming) ?? 0
    const leftAt = readPitcherStateValue(state.pitcherExitDefenseOuts, side, incoming) ?? outs
    entry[scoped] = firstEntry + (outs - leftAt)
    delete exit[scoped]
  } else {
    entry[scoped] = outs
    runs[scoped] = 0
  }

  return {
    ...state,
    pitcherEntryDefenseOuts: entry,
    pitcherExitDefenseOuts: exit,
    pitcherRunsAllowed: runs,
    pitcherStint: { ...(state.pitcherStint ?? {}), [side]: { cardKey: incoming, battersFaced: 0, halfKey: halfKey(state) } },
    plateAppearance: {
      ...state.plateAppearance,
      pitcherCardKey: state.plateAppearance.pitcherCardKey === outgoing ? incoming : state.plateAppearance.pitcherCardKey,
    },
  }
}

/**
 * Outs a pitcher recorded in this game: from his (possibly slid) entry to when
 * he last left the mound, or to now if he is still on it. Null for games
 * recorded before exits were tracked, so callers can fall back.
 */
export function outsPitched(state: GameState, side: GameSide, cardKey: string): number | null {
  // No exits at all: a game from before they were recorded (or one whose
  // pitcher never changed); the caller's entry-to-entry split is exact there.
  if (!state.pitcherExitDefenseOuts || Object.keys(state.pitcherExitDefenseOuts).length === 0) return null
  const entry = readPitcherStateValue(state.pitcherEntryDefenseOuts, side, cardKey) ?? 0
  if (state.pregame[side].defensiveAlignment.P === cardKey) return Math.max(0, defensiveOutsRecorded(state, side) - entry)
  const exit = readPitcherStateValue(state.pitcherExitDefenseOuts, side, cardKey)
  return exit === undefined ? null : Math.max(0, exit - entry)
}
