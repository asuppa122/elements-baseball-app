import { lineScore, runsInInning } from './inningScore'
import { battingSide } from './gameBoundaryEngine'
import type { GameSide, GameState, HalfInning } from './types'

/**
 * The half-inning transition: what to show in the beat between a half ending
 * and the next one starting.
 *
 * The scoreboard OWNS the line score; this only SHOWS it, at the moment a
 * column is freshly filled. Scale follows the half — a scoreless half is an
 * announcement plus that column, a scoring half also gets the plays that
 * produced it.
 *
 * Nothing here resolves anything. The engine never sets `inning_transition`,
 * so when to show this is a presentation decision (the shell notices the half
 * changed); this module only builds the content for a half that has ended.
 */

/**
 * Only what a scoring play is derived from. Deliberately narrower than
 * `GameplayLabEvent` so any caller holding the two fields this reads can pass
 * its own rows -- the playable shell keeps a trimmed event shape in local
 * state, and a module should not demand fields it never touches.
 */
export type ScoringEventInput = {
  state_version: number
  payload: Record<string, unknown>
}

export type ScoringPlay = {
  inning: number
  half: HalfInning
  side: GameSide
  batter: string | null
  pitcher: string | null
  chartResult: string | null
  runs: number
  outsBefore: number | null
  stateVersion: number
}

export type ScoringPlayDerivation = {
  plays: ScoringPlay[]
  /**
   * False when this game's events carry no score information at all, which is
   * every game played through the playable shell — it writes a minimal
   * `{roll, chartResult, playableShell}` payload, while GameplayGameStatePage
   * writes the full before/after. Absent is not the same as "no runs scored".
   */
  available: boolean
  /**
   * True only when the derived runs reconcile against `runsByInning`. Runs
   * scored by a manager decision are invisible here — no DECISION_RESOLVED
   * payload carries a score (0 of 40 on the one real completed game with rich
   * payloads) — so a derived list can be genuinely short. When this is false
   * the list must be presented as partial, never as the scoring summary.
   */
  complete: boolean
}

export type HalfInningTransitionTier = 'SCORELESS' | 'SCORING' | 'UNKNOWN'

export type HalfInningTransition = {
  inning: number
  half: HalfInning
  /** The side that was batting in the half that just ended. */
  side: GameSide
  /** Runs in the half just ended; null when this game predates `runsByInning`. */
  runs: number | null
  tier: HalfInningTransitionTier
  score: Record<GameSide, number>
  lineScore: { away: number[]; home: number[]; innings: number; recorded: boolean }
  /** Index into the line score arrays for the column just filled. */
  filledColumn: number
  scoringPlays: ScoringPlayDerivation
  /**
   * Scoring plays from EARLIER in the game, newest first — the expanded state.
   * Strictly before this half: reviewing the 4th inning of a finished game must
   * not list a 9th-inning run under "scoring so far".
   */
  earlierScoringPlays: ScoringPlay[]
  /**
   * True only when THIS half is the one that ended the game. Status alone is
   * not enough: every half of a finished game would claim to have ended it,
   * and an earlier half reviewed after the fact would announce a walk-off.
   * completeGame() freezes inning/half where play stopped, so the final half
   * is the one matching the state.
   */
  gameComplete: boolean
}

/** The half immediately before this one; inning 1 top has none. */
export function previousHalf(inning: number, half: HalfInning): { inning: number; half: HalfInning } | null {
  if (half === 'bottom') return { inning, half: 'top' }
  if (inning <= 1) return null
  return { inning: inning - 1, half: 'bottom' }
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function scoreOf(value: unknown): Record<GameSide, number> | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const away = asNumber(record.away)
  const home = asNumber(record.home)
  return away === null || home === null ? null : { away, home }
}

/**
 * Recovers scoring plays by diffing each event's before/after score. This is
 * reading what the engine already recorded, not reconstructing baseball from
 * dice — an event that did not change the score is not a scoring play.
 */
export function deriveScoringPlays(events: readonly ScoringEventInput[]): Omit<ScoringPlayDerivation, 'complete'> {
  let sawScoreBearingPayload = false
  const plays: ScoringPlay[] = []

  for (const event of events) {
    const payload = event.payload ?? {}
    const before = scoreOf(payload.score)
    const after = scoreOf(payload.resultingScore)
    if (!before || !after) continue
    sawScoreBearingPayload = true

    const half = payload.half === 'top' || payload.half === 'bottom' ? payload.half : null
    const inning = asNumber(payload.inning)
    if (half === null || inning === null) continue

    const side = battingSide(half)
    const runs = after[side] - before[side]
    if (runs <= 0) continue

    plays.push({
      inning,
      half,
      side,
      batter: asString(payload.batter),
      pitcher: asString(payload.pitcher),
      chartResult: asString(payload.chartResult),
      runs,
      outsBefore: asNumber(payload.outs),
      stateVersion: event.state_version,
    })
  }

  return { plays, available: sawScoreBearingPayload }
}

export function buildHalfInningTransition(
  state: GameState,
  events: readonly ScoringEventInput[],
  completed: { inning: number; half: HalfInning },
): HalfInningTransition {
  const side = battingSide(completed.half)
  const derived = deriveScoringPlays(events)
  const line = lineScore(state)
  const recorded = state.runsByInning !== undefined
  const runs = recorded ? runsInInning(state, side, completed.inning) : null

  const inThisHalf = derived.plays.filter((p) => p.inning === completed.inning && p.half === completed.half)
  const derivedRuns = inThisHalf.reduce((total, p) => total + p.runs, 0)

  // Reconciliation is the only honest way to know the list is whole: if the
  // half's recorded runs exceed what the events account for, something scored
  // by a route that carries no score in its payload.
  const complete = derived.available && runs !== null && derivedRuns === runs

  const halfIndex = (inning: number, half: HalfInning) => inning * 2 + (half === 'top' ? 0 : 1)
  const completedIndex = halfIndex(completed.inning, completed.half)
  const earlier = derived.plays
    .filter((p) => halfIndex(p.inning, p.half) < completedIndex)
    .sort((a, b) => b.stateVersion - a.stateVersion)

  const tier: HalfInningTransitionTier = runs === null ? 'UNKNOWN' : runs > 0 ? 'SCORING' : 'SCORELESS'

  return {
    inning: completed.inning,
    half: completed.half,
    side,
    runs,
    tier,
    score: { away: state.score.away, home: state.score.home },
    lineScore: { ...line, recorded },
    filledColumn: completed.inning - 1,
    scoringPlays: { ...derived, plays: inThisHalf, complete },
    earlierScoringPlays: earlier,
    gameComplete: state.status === 'complete'
      && state.inning === completed.inning
      && state.half === completed.half,
  }
}
