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
  bases: BasesState
  plateAppearance: PlateAppearanceState
  pendingDecision: PendingDecision | null
  lineupCursor: Record<GameSide, number>
  outfieldThrowUsage?: Record<GameSide, Record<'LF' | 'CF' | 'RF', number>>
  infieldDoublePlayUsage?: Record<GameSide, Partial<Record<'1B+2B+SS' | '1B+2B+3B' | '1B+3B+SS', number>>>
  naturalStolenBaseUsed?: Record<GameSide, boolean>
  appearedCardKeys?: Record<GameSide, string[]>
  pitcherEntryDefenseOuts?: Record<string, number>
  pitcherRunsAllowed?: Record<string, number>
  pitcherShutoutBonusBrokenAtOuts?: Record<string, number>
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
