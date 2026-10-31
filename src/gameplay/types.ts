import type { ActiveSeasonConfiguration } from './seasonConfig'

export type GameSide = 'home' | 'away'
export type HalfInning = 'top' | 'bottom'

export type GameLifecycleStatus =
  | 'setup'
  | 'pregame'
  | 'ready'
  | 'in_progress'
  | 'awaiting_decision'
  | 'inning_transition'
  | 'paused'
  | 'complete'
  /** A manager cancelled it before the first pitch. No result. */
  | 'cancelled'
  /** Ended by a gameplay admin (or the Stage 3 practice cleanup). No result. */
  | 'terminated'

export type RuleConditionType =
  | 'RC1_VISIBLE_STATE'
  | 'RC2_LOCKED_MANAGER_DECISION'
  | 'RC3_MLB_TIMELINE'
  | 'RC4_ACTIVE_SEASON_CONFIGURATION'
  | 'RC5_CONDITIONAL_GAME_STATE'

export type GameManagerSnapshot = {
  userId: string
  managerName: string
}

export type GameCardSnapshot = {
  cardKey: string
  playerName: string
  imageUrl: string | null
  year: number | null
  points: number
  hitter: {
    bats: string | null
    onBase: number | null
    fatigue: number | null
    baserunning: number | null
    stolenBase: number | null
    chart: {
      PU: string | null
      K: string | null
      GB: string | null
      FB: string | null
      BB: string | null
      '1B': string | null
      '1B+': string | null
      '2B': string | null
      '3B': string | null
      HR: string | null
    }
  }
  pitcher: {
    arm: string | null
    control: number | null
    fatigue: number | null
    ip: number | null
    chart: {
      PU: string | null
      K: string | null
      GB: string | null
      FB: string | null
      BB: string | null
      '1B': string | null
      '2B': string | null
      '3B': string | null
      HR: string | null
    }
  }
  defense: Partial<Record<'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF', number>>
}

export type GameRosterSnapshot = {
  sourceLineupId: string
  sourceLineupName: string
  capturedAt: string
  rosterFormat: string
  useDh: boolean
  seasonEligibleOnly: boolean
  playerCount: number
  totalPoints: number
  assignments: Record<string, string>
  cards: Record<string, GameCardSnapshot>
}

export type PitcherStint = {
  cardKey: string
  /** Completed plate appearances against him since he took the mound. */
  battersFaced: number
  /** The half-inning (`${inning}-${half}`) he last completed a batter in, or
   *  took the mound in; null for a starter who has not yet pitched. */
  halfKey: string | null
}

export type DefensivePosition = 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'P' | 'DH'

export type PregameManagerState = {
  side: GameSide
  manager: GameManagerSnapshot
  roster: GameRosterSnapshot | null
  startingPitcherCardKey: string | null
  defaultBatterCardKeys: string[]
  defaultPitcherCardKeys?: string[]
  battingOrderCardKeys: string[]
  defensiveAlignment: Partial<Record<DefensivePosition, string>>
  submittedAt: string | null
  locked: boolean
}

export type BaseRunnerState = {
  cardKey: string
  playerName: string
  baserunning: number | null
  stolenBase: number | null
}

export type BasesState = {
  first: BaseRunnerState | null
  second: BaseRunnerState | null
  third: BaseRunnerState | null
}

export type PendingDecision = {
  id: string
  ruleCondition: 'RC2_LOCKED_MANAGER_DECISION' | 'RC5_CONDITIONAL_GAME_STATE'
  decisionType: string
  actingSide: GameSide
  legalActions: string[]
  context: Record<string, unknown>
  createdAt: string
}

export type GameplayWaitingFor =
  | 'PITCH_ROLL'
  | 'SWING_ROLL'
  | 'CONDITIONAL_DECISION'
  | 'INNING_TRANSITION'
  | 'GAME_COMPLETE'

export type PlateAppearanceState = {
  batterCardKey: string | null
  pitcherCardKey: string | null
  pitchRoll: number | null
  pitchTotal: number | null
  advantage: 'hitter' | 'pitcher' | null
  swingRoll: number | null
  chartResult: string | null
  infieldIn?: boolean
  // Two-player games only: the batting manager has made any calls and declared
  // ready, so the fielding manager may now act and pitch. See turnOrder.ts.
  offenseReady?: boolean
}

export type GameState = {
  gameId: string
  stateVersion: number
  status: GameLifecycleStatus
  configuration: ActiveSeasonConfiguration
  managers: Record<GameSide, GameManagerSnapshot>
  pregame: Record<GameSide, PregameManagerState>
  inning: number
  half: HalfInning
  outs: 0 | 1 | 2 | 3
  score: Record<GameSide, number>
  // Runs credited to the inning they scored in (index 0 = 1st inning); extra
  // innings extend the array. Written at the moment a run scores via
  // inningScore.ts, never reconstructed from events. Optional because games
  // persisted before this field existed must still load -- absent means "no
  // per-inning record", not zero runs.
  runsByInning?: Record<GameSide, number[]>
  bases: BasesState
  plateAppearance: PlateAppearanceState
  pendingDecision: PendingDecision | null
  lineupCursor: Record<GameSide, number>
  outfieldThrowUsage?: Record<GameSide, Record<'LF' | 'CF' | 'RF', number>>
  infieldDoublePlayUsage?: Record<GameSide, Partial<Record<'1B+2B+SS' | '1B+2B+3B' | '1B+3B+SS', number>>>
  naturalStolenBaseUsed?: Record<GameSide, boolean>
  // Roster moves (pinch hitter/runner, defensive sub, pitching change, double
  // switch) open only once the game's first pitch has been thrown -- a real
  // pitch roll, the automatic NO PITCH advantage, a failed bunt that goes to
  // the pitcher's chart -- or once any plate appearance has been completed,
  // even one with no pitch (leadoff IBB or bunt). Set false at game start. Absent means a game saved
  // before this field existed and is treated as already past the first pitch,
  // so no saved game loses its bench mid-game.
  firstPitchThrown?: boolean
  // Set when a game is created for two managers at two screens: turns follow
  // turnOrder.ts (offence readies, then the defence pitches). Absent for the
  // lab, the sandbox and scenario fixtures, where one person plays both sides.
  turnHandshake?: boolean
  // Substitution no-re-entry tracking ("which cards can no longer be pulled
  // from the bench") -- seeded with the full starting lineup at game start.
  // NOT a fatigue/appearance signal -- see hitterPlateAppearanceCardKeys /
  // pitcherAppearanceCardKeys below for that.
  appearedCardKeys?: Record<GameSide, string[]>
  // Real, precise per-game plate-appearance/pitching-appearance record, set
  // exclusively inside finishPlateAppearance() the moment a plate appearance
  // actually concludes (chart result, intentional walk, sac/squeeze bunt,
  // any RTS-driven finish -- every legal path funnels through that one
  // function). Starts empty at game start, unlike appearedCardKeys above.
  // This is the source of truth persistent rest-tracking reads at game
  // completion to decide who accrues Ftg -- see restTracking.ts.
  hitterPlateAppearanceCardKeys?: Record<GameSide, string[]>
  pitcherAppearanceCardKeys?: Record<GameSide, string[]>
  // Each side's persistent cross-game Ftg/Rm rest counters (player_rest_state
  // rows), fetched once by that side's own manager at pregame time and
  // frozen into the state from then on -- an in-progress game never re-reads
  // a live row, matching how the roster snapshot itself is frozen. Missing
  // entirely, or missing a given card_key, both mean "fully rested" (0/0),
  // not an error -- a brand-new card with no prior games has no row yet.
  restState?: Record<GameSide, Record<string, { hitterGamesRemaining: number; pitcherGamesRemaining: number }>>
  pitcherEntryDefenseOuts?: Record<string, number>
  pitcherRunsAllowed?: Record<string, number>
  pitcherShutoutBonusBrokenAtOuts?: Record<string, number>
  // Defensive out count when each pitcher (pitcherInstanceKey) last left the
  // mound. With pitcherEntryDefenseOuts it gives every pitcher one continuous
  // line even when he moves to the field and comes back (MLB 5.10, adopted
  // 2026-10-30). See pitcherMound.ts.
  pitcherExitDefenseOuts?: Record<string, number>
  // The pitcher now on each side's mound, for the three-batter minimum (MLB
  // 5.10(g), adopted 2026-10-30). Absent in games created before it, which
  // therefore carry no minimum.
  pitcherStint?: Partial<Record<GameSide, PitcherStint>>
  // Inning in which a pitcher (pitcherInstanceKey) last moved from P to a
  // field position: MLB 5.10(d) Comment allows that once per inning.
  pitcherToFieldInning?: Record<string, number>
  waitingFor: GameplayWaitingFor | null
  nextActor: GameSide | null
  paused: {
    pausedAt: string | null
    pausedByUserId: string | null
    resumeStatus: Exclude<GameLifecycleStatus, 'paused'> | null
  }
  createdAt: string
  updatedAt: string
}

export type GameEventType =
  | 'GAME_CREATED'
  | 'ROSTER_SNAPSHOT_ATTACHED'
  | 'PREGAME_SUBMITTED'
  | 'PREGAME_LOCKED'
  | 'GAME_READY'
  | 'GAME_STARTED'
  | 'GAME_PAUSED'
  | 'GAME_RESUMED'
  | 'DECISION_REQUESTED'
  | 'DECISION_SUBMITTED'
  | 'PITCH_ROLLED'
  | 'ADVANTAGE_DETERMINED'
  | 'SWING_ROLLED'
  | 'RESULT_RESOLVED'
  | 'INNING_ENDED'
  | 'GAME_COMPLETED'

export type GameEvent = {
  gameId: string
  stateVersion: number
  eventType: GameEventType
  actorUserId: string | null
  payload: Record<string, unknown>
  createdAt: string
}
