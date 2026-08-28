import { defensiveOutsRecorded } from './engine'
import { lineScore } from './inningScore'
import { readPitcherStateValue } from './pitcherStateKey'
import { applyGameCompletionRest } from './restTracking'
import type { GameCardSnapshot, GameSide, GameState } from './types'

/**
 * Post-game summary, tier one: everything a finished game can report from state
 * it already holds. Read-only and pure -- it derives, it never resolves.
 *
 * Tier two (the full batting box: AB/H/RBI/runs per batter) is deliberately NOT
 * here. Those are not tracked and RBI/runs are not reconstructable from
 * `game_events` as written today; see GAMEPLAY_PRESENTATION_PLAN.md's "Data that
 * does not exist yet". Tier one must not be held hostage to that work, and this
 * module must never fill the gap with a plausible-looking guess -- anything it
 * cannot source is absent or explicitly flagged, never estimated.
 */

export type PostGameLineScore = {
  away: number[]
  home: number[]
  innings: number
  /**
   * False for games persisted before `runsByInning` existed. Their innings read
   * as zeroes, which is indistinguishable from a real 0-0-0 line -- so the
   * caller must render dashes, not a row of zeros. This is not the same as a
   * game that genuinely scored nothing.
   */
  recorded: boolean
}

export type PitchingLine = {
  cardKey: string
  playerName: string
  /** Order taken the mound. Index 0 is the starter. */
  order: number
  outsRecorded: number
  /** Baseball notation: 6.2 is six innings and two outs, not six and two-thirds. */
  inningsPitched: string
  runsAllowed: number
  printedControl: number | null
  printedIp: number | null
  /** Threw the last pitch of the game for this side. */
  finished: boolean
}

export type RestConsequence = {
  cardKey: string
  playerName: string
  hitterAppeared: boolean
  pitcherAppeared: boolean
  priorHitterGamesRemaining: number
  priorPitcherGamesRemaining: number
  hitterGamesRemaining: number
  pitcherGamesRemaining: number
  /** Printed Ftg for each track; null where the card has no rating for it. */
  hitterFatigueScore: number | null
  pitcherFatigueScore: number | null
}

export type RestProjection =
  | { available: true; side: GameSide; players: RestConsequence[] }
  /**
   * Withheld rather than approximated. Two ways that happens:
   *
   * - MISSING_SEASON_GAME_COUNT: the milestone step needs this manager's
   *   completed-game count for the season, which lives in the `games` table
   *   and not in GameState.
   * - MISSING_REST_MILESTONES: the game's frozen `configuration` snapshot
   *   predates `restMilestones` entirely, so the season's milestone rule is
   *   not knowable from the game. Every game persisted as of 2026-08-28 is in
   *   this state, and passing the undefined through crashed the whole panel.
   *
   * Either way the number would be wrong on exactly the games where it matters
   * most, which is the one line in this box score no other product has.
   */
  | { available: false; side: GameSide; reason: 'MISSING_SEASON_GAME_COUNT' | 'MISSING_REST_MILESTONES' }

export type PostGameSummary = {
  complete: boolean
  final: {
    away: number
    home: number
    winner: GameSide | null
    /** The inning the game actually ended in -- extra innings included. */
    inningsPlayed: number
    walkoff: boolean
  }
  lineScore: PostGameLineScore
  pitching: Record<GameSide, PitchingLine[]>
  /**
   * False for games persisted before `hitterPlateAppearanceCardKeys` /
   * `pitcherAppearanceCardKeys` existed -- as of 2026-08-28 that is every game
   * in the table. Without it an empty pitching list is ambiguous: "nobody
   * pitched" (impossible in a completed game) reads identically to "this game
   * never recorded who did". The caller must say which, not show an empty
   * panel. Note `pitcherRunsAllowed` IS populated on those games, but it is a
   * map with no appearance order and, on the oldest rows, no side scoping --
   * enough to know runs were charged, not enough to build a line from.
   */
  appearancesRecorded: boolean
  rest: Record<GameSide, RestProjection>
  appearances: Record<GameSide, { hitters: string[]; pitchers: string[] }>
}

/** Outs as innings-pitched: 20 outs -> "6.2". */
export function formatInningsPitched(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

function cardOf(state: GameState, side: GameSide, cardKey: string): GameCardSnapshot | null {
  return state.pregame[side].roster?.cards[cardKey] ?? null
}

function nameOf(state: GameState, side: GameSide, cardKey: string): string {
  return cardOf(state, side, cardKey)?.playerName ?? cardKey
}

/**
 * Each pitcher's line for one side. A pitcher's workload is the gap between
 * their own entry out-count and the next pitcher's -- the last one runs to the
 * side's final defensive out. Entry outs are only written on a substitution, so
 * a starter who was never relieved has no entry row and correctly reads 0.
 */
export function pitchingLinesFor(state: GameState, side: GameSide): PitchingLine[] {
  const order = state.pitcherAppearanceCardKeys?.[side] ?? []
  const totalOuts = defensiveOutsRecorded(state, side)
  const entryOuts = order.map((key) => readPitcherStateValue(state.pitcherEntryDefenseOuts, side, key) ?? 0)

  return order.map((cardKey, index) => {
    const card = cardOf(state, side, cardKey)
    const exit = index + 1 < order.length ? entryOuts[index + 1] : totalOuts
    return {
      cardKey,
      playerName: nameOf(state, side, cardKey),
      order: index,
      outsRecorded: Math.max(0, exit - entryOuts[index]),
      inningsPitched: formatInningsPitched(Math.max(0, exit - entryOuts[index])),
      runsAllowed: readPitcherStateValue(state.pitcherRunsAllowed, side, cardKey) ?? 0,
      printedControl: card?.pitcher.control ?? null,
      printedIp: card?.pitcher.ip ?? null,
      finished: index === order.length - 1,
    }
  })
}

/**
 * What this game costs a side in availability. The single Elements-specific
 * thing a box score can say that no other product's can: who is unavailable
 * for the next game because of what just happened.
 *
 * `completedGamesThisSeason` must INCLUDE the game just completed (see
 * restTracking.ts). Pass null when it is not known -- the result says so.
 */
export function restProjectionFor(
  state: GameState,
  side: GameSide,
  completedGamesThisSeason: number | null,
): RestProjection {
  if (completedGamesThisSeason === null) return { available: false, side, reason: 'MISSING_SEASON_GAME_COUNT' }
  // Read defensively: this is a frozen snapshot from whenever the game was
  // created, not today's season config, so the field may simply not be there.
  const restMilestones = state.configuration.restMilestones
  if (!Array.isArray(restMilestones)) return { available: false, side, reason: 'MISSING_REST_MILESTONES' }

  const hitters = new Set(state.hitterPlateAppearanceCardKeys?.[side] ?? [])
  const pitchers = new Set(state.pitcherAppearanceCardKeys?.[side] ?? [])
  const prior = state.restState?.[side] ?? {}
  // Everyone the game touched, plus everyone already carrying a rest debt --
  // a rested-yesterday player who sat today still ticks down, and omitting
  // them would read as "nothing changed" when their counter did move.
  const cardKeys = [...new Set([...hitters, ...pitchers, ...Object.keys(prior)])]

  const players = cardKeys.map((cardKey) => {
    const card = cardOf(state, side, cardKey)
    const priorHitter = prior[cardKey]?.hitterGamesRemaining ?? 0
    const priorPitcher = prior[cardKey]?.pitcherGamesRemaining ?? 0
    const next = applyGameCompletionRest({
      priorHitterGamesRemaining: priorHitter,
      priorPitcherGamesRemaining: priorPitcher,
      hitterFatigueScore: card?.hitter.fatigue ?? null,
      pitcherFatigueScore: card?.pitcher.fatigue ?? null,
      hitterAppeared: hitters.has(cardKey),
      pitcherAppeared: pitchers.has(cardKey),
      gmCompletedGamesThisSeason: completedGamesThisSeason,
      restMilestones,
    })
    return {
      cardKey,
      playerName: nameOf(state, side, cardKey),
      hitterAppeared: hitters.has(cardKey),
      pitcherAppeared: pitchers.has(cardKey),
      priorHitterGamesRemaining: priorHitter,
      priorPitcherGamesRemaining: priorPitcher,
      hitterGamesRemaining: next.hitterGamesRemaining,
      pitcherGamesRemaining: next.pitcherGamesRemaining,
      hitterFatigueScore: card?.hitter.fatigue ?? null,
      pitcherFatigueScore: card?.pitcher.fatigue ?? null,
    }
  })

  // Order by what the manager has to act on: whoever is still owed rest is
  // unavailable for the next game, and that is the whole point of this panel.
  // Roster order would bury it among players who came through fine.
  const owed = (p: RestConsequence) => Math.max(p.hitterGamesRemaining, p.pitcherGamesRemaining)
  players.sort((a, b) => owed(b) - owed(a) || a.playerName.localeCompare(b.playerName))

  return { available: true, side, players }
}

export function buildPostGameSummary(
  state: GameState,
  completedGamesThisSeason: Record<GameSide, number | null> = { away: null, home: null },
): PostGameSummary {
  const line = lineScore(state)
  const walkoff = state.status === 'complete' && state.half === 'bottom' && state.score.home > state.score.away && state.outs < 3

  return {
    complete: state.status === 'complete',
    final: {
      away: state.score.away,
      home: state.score.home,
      winner: state.score.home > state.score.away ? 'home' : state.score.away > state.score.home ? 'away' : null,
      inningsPlayed: state.inning,
      walkoff,
    },
    lineScore: { ...line, recorded: state.runsByInning !== undefined },
    appearancesRecorded: state.pitcherAppearanceCardKeys !== undefined || state.hitterPlateAppearanceCardKeys !== undefined,
    pitching: { away: pitchingLinesFor(state, 'away'), home: pitchingLinesFor(state, 'home') },
    rest: {
      away: restProjectionFor(state, 'away', completedGamesThisSeason.away),
      home: restProjectionFor(state, 'home', completedGamesThisSeason.home),
    },
    appearances: {
      away: {
        hitters: [...(state.hitterPlateAppearanceCardKeys?.away ?? [])],
        pitchers: [...(state.pitcherAppearanceCardKeys?.away ?? [])],
      },
      home: {
        hitters: [...(state.hitterPlateAppearanceCardKeys?.home ?? [])],
        pitchers: [...(state.pitcherAppearanceCardKeys?.home ?? [])],
      },
    },
  }
}
