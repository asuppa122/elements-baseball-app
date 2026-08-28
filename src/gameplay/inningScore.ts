import type { GameSide, GameState } from './types'

/**
 * Per-inning run tracking (the line score).
 *
 * `score` on GameState is a running total only, so a line score cannot be read
 * back from it, and reconstructing one from `game_events` is fragile -- the
 * payloads record what number came up, not what the base state was before and
 * after. So runs are credited to their inning at the moment they score, in the
 * only two places a run is ever added (`scoreRunner` in coreGame.ts and
 * `score` in decisionEngine.ts), both of which call through here so the two
 * paths cannot drift apart.
 *
 * Index 0 is the 1st inning; extra innings extend the array. A run is credited
 * to `state.inning` as it stands when the run scores, which is always inside
 * the half its side is batting -- the inning advances only after the plate
 * appearance has finished resolving.
 */
export function creditRunsToInning(
  runsByInning: Partial<Record<GameSide, number[]>> | undefined,
  side: GameSide,
  inning: number,
  runs: number,
): Record<GameSide, number[]> {
  const away = [...(runsByInning?.away ?? [])]
  const home = [...(runsByInning?.home ?? [])]
  const target = side === 'away' ? away : home
  const index = Math.max(0, inning - 1)
  // A side can reach an inning without having scored in earlier ones, so the
  // array is padded rather than left sparse -- a sparse array serialises to
  // nulls in the persisted GameState JSON.
  while (target.length <= index) target.push(0)
  target[index] += runs
  return { away, home }
}

/** Runs a side has scored in a given inning; 0 for innings not yet reached. */
export function runsInInning(state: GameState, side: GameSide, inning: number): number {
  return state.runsByInning?.[side]?.[inning - 1] ?? 0
}

/**
 * The line score as far as the game has gone. Length is the furthest inning
 * either side has a bucket for, so extra innings extend it naturally.
 */
export function lineScore(state: GameState): { away: number[]; home: number[]; innings: number } {
  const away = state.runsByInning?.away ?? []
  const home = state.runsByInning?.home ?? []
  const innings = Math.max(away.length, home.length, state.inning)
  const pad = (xs: number[]) => Array.from({ length: innings }, (_, i) => xs[i] ?? 0)
  return { away: pad(away), home: pad(home), innings }
}
