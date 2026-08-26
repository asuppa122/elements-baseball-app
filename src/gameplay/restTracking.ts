import type { RestMilestone } from './seasonConfig'

/**
 * Persistent, cross-game Ftg/Rm tracking -- distinct from fatigueEngine.ts,
 * which only ever computes the *effect* of a given "games from rested" count
 * on a player's effective On Base/Control within one game. This module is
 * the missing other half: how that count itself changes at the end of each
 * completed game. Nothing in fatigueEngine.ts's tested formulas is touched
 * here; this only produces the `gamesFromRested`/`cardFatigue`-shaped inputs
 * those formulas already expect.
 *
 * Confirmed three-step sequence per completed game, per player, per track
 * (hitter/pitcher tracked independently -- a two-way player can be fatigued
 * as one and rested as the other):
 *   a. Appearance increment  -- unconditional per player who appeared this
 *      game: += their printed card fatigue score for that track.
 *   b. Flat per-game decrement -- unconditional, every game, every rostered
 *      player regardless of appearance: -1.
 *   c. Milestone bonus decrement -- conditional: only on a game where the
 *      GM's completed-game count this season lands on a season-configured
 *      milestone (see seasonConfig.ts's `restMilestones`), an additional
 *      -bonusRestDays for every rostered player.
 * All three can apply to the same player in the same game. Each step floors
 * at 0 (a player can never owe negative rest).
 */

export type RestTrack = {
  hitterGamesRemaining: number
  pitcherGamesRemaining: number
}

export type GameCompletionRestInput = {
  priorHitterGamesRemaining: number
  priorPitcherGamesRemaining: number
  /** The card's printed fatigue score for each track -- null/absent cards score 0, not a NaN/crash. */
  hitterFatigueScore: number | null
  pitcherFatigueScore: number | null
  hitterAppeared: boolean
  pitcherAppeared: boolean
  /** This GM's total completed games this season, INCLUDING the one just completed. */
  gmCompletedGamesThisSeason: number
  restMilestones: RestMilestone[]
}

/** Step (a): += printed fatigue score if this track's player appeared, else unchanged. */
export function applyAppearanceIncrement(priorGamesRemaining: number, fatigueScore: number | null, appeared: boolean): number {
  if (!appeared) return Math.max(0, priorGamesRemaining)
  return Math.max(0, priorGamesRemaining) + Math.max(0, fatigueScore ?? 0)
}

/** Step (b): -1, every game, unconditionally, floored at 0. */
export function applyFlatPerGameDecrement(gamesRemaining: number): number {
  return Math.max(0, gamesRemaining - 1)
}

/**
 * How many bonus rest days apply on the game where a GM's completed-game
 * count equals `gmCompletedGamesThisSeason`. Sums every milestone tier whose
 * cadence the count lands on exactly (so a season could in principle stack
 * two tiers on the same game, e.g. a count that is a multiple of both 8 and
 * a hypothetical second tier). An empty `restMilestones` array -- a season
 * with no bonus-rest tiers at all -- always returns 0, not a special case.
 */
export function milestoneBonusForGameCount(gmCompletedGamesThisSeason: number, restMilestones: RestMilestone[]): number {
  let bonus = 0
  for (const milestone of restMilestones) {
    if (milestone.gamesPlayed > 0 && gmCompletedGamesThisSeason % milestone.gamesPlayed === 0) {
      bonus += milestone.bonusRestDays
    }
  }
  return bonus
}

/** Step (c): -bonusRestDays for the milestones this game count lands on, floored at 0. */
export function applyMilestoneDecrement(gamesRemaining: number, gmCompletedGamesThisSeason: number, restMilestones: RestMilestone[]): number {
  return Math.max(0, gamesRemaining - milestoneBonusForGameCount(gmCompletedGamesThisSeason, restMilestones))
}

/** Runs all three steps, in order, for both the hitter and pitcher tracks independently. */
export function applyGameCompletionRest(input: GameCompletionRestInput): RestTrack {
  const runTrack = (priorGamesRemaining: number, fatigueScore: number | null, appeared: boolean): number => {
    const afterAppearance = applyAppearanceIncrement(priorGamesRemaining, fatigueScore, appeared)
    const afterFlat = applyFlatPerGameDecrement(afterAppearance)
    return applyMilestoneDecrement(afterFlat, input.gmCompletedGamesThisSeason, input.restMilestones)
  }

  return {
    hitterGamesRemaining: runTrack(input.priorHitterGamesRemaining, input.hitterFatigueScore, input.hitterAppeared),
    pitcherGamesRemaining: runTrack(input.priorPitcherGamesRemaining, input.pitcherFatigueScore, input.pitcherAppeared),
  }
}
