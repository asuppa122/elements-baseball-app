import type { GameSide, GameState } from './types'

/**
 * The before/after envelope written into every `game_events` payload.
 *
 * Two pages persist gameplay, and they used to write different payloads for the
 * same event: GameplayGameStatePage recorded the full picture while
 * GameplayPlayableShellPage recorded `{roll, chartResult, playableShell}`. That
 * split is why four of the completed games -- including a 10-2 -- cannot produce
 * a single scoring play, while `65efe77d` yields its real walk-off.
 *
 * So the envelope lives here, and both sites build it from the same function.
 * Keeping it in one place is the point: a second hand-rolled copy is exactly the
 * drift this is fixing.
 *
 * Purely descriptive. Nothing here resolves anything, and nothing reads it back
 * into the engine -- it is the record a presentation layer reads afterwards.
 *
 * BACKWARD COMPATIBILITY: this only ever ADDS keys to a jsonb payload. Events
 * already persisted are untouched, the RPC does not validate payload shape, and
 * every consumer (deriveScoringPlays) treats each field as optional and skips
 * what it cannot find. Games that predate this keep working exactly as before,
 * the same way the optional `runsByInning` field was introduced.
 */

function playerName(state: GameState, side: GameSide, cardKey: string | null): string | null {
  if (!cardKey) return null
  return state.pregame[side].roster?.cards[cardKey]?.playerName ?? cardKey
}

function battingSideOf(state: GameState): GameSide {
  return state.half === 'top' ? 'away' : 'home'
}

function fieldingSideOf(state: GameState): GameSide {
  return state.half === 'top' ? 'home' : 'away'
}

/**
 * Key names match what GameplayGameStatePage already wrote, so existing
 * consumers of those events keep working unchanged and the two sources become
 * one shape rather than two.
 */
export function buildEventEnvelope(before: GameState, after: GameState): Record<string, unknown> {
  return {
    // Where the play started.
    inning: before.inning,
    half: before.half,
    outs: before.outs,
    score: { away: before.score.away, home: before.score.home },
    bases: structuredClone(before.bases),
    batter: playerName(before, battingSideOf(before), before.plateAppearance.batterCardKey),
    pitcher: playerName(before, fieldingSideOf(before), before.plateAppearance.pitcherCardKey),
    advantage: before.plateAppearance.advantage,

    // Where it ended. `resultingScore` against `score` is what makes a run
    // attributable to a play at all -- including runs scored on a manager
    // decision, which carried no score anywhere before this.
    resultingOuts: after.outs,
    resultingScore: { away: after.score.away, home: after.score.home },
    resultingBases: structuredClone(after.bases),
    nextInning: after.inning,
    nextHalf: after.half,
    gameStatus: after.status,
    pendingDecision: after.pendingDecision?.decisionType ?? null,
  }
}

/** True when this transition scored at least one run for either side. */
export function envelopeScoredRuns(before: GameState, after: GameState): boolean {
  return after.score.away > before.score.away || after.score.home > before.score.home
}
