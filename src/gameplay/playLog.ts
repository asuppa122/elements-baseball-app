import { rulesVersionOf } from './rulesVersion'
import type {
  BasesState,
  BattingCredit,
  GameSide,
  GameState,
  OpenPlay,
  PlayDefenseAttempt,
  PlayRecord,
  PlayRun,
  PlayRunner,
  PlaySteal,
} from './types'

/**
 * The structured play-by-play: one record per resolved event, written once and
 * kept in the game state (so it is saved with every move and survives a
 * reload). Box scores, live lines and statistics are derived from it by
 * stats/ -- never from the human-readable note.
 *
 * Facts are gathered on `playLog.open` while a play is under way (a plate
 * appearance can span several saves: pitch, swing, extra-base decision,
 * throw) and flushed into `plays` when it ends. Games without a `playLog`
 * (created before it existed) record nothing: their history is limited to
 * what the saved state already holds.
 */

const battingSide = (state: GameState): GameSide => (state.half === 'top' ? 'away' : 'home')
const fieldingSide = (state: GameState): GameSide => (state.half === 'top' ? 'home' : 'away')

export function basesToRunners(bases: BasesState): PlayRunner[] {
  const out: PlayRunner[] = []
  for (const base of ['first', 'second', 'third'] as const) {
    const runner = bases[base]
    if (runner) out.push({ cardKey: runner.cardKey, base })
  }
  return out
}

export function currentPitcherKey(state: GameState): string | null {
  const defense = fieldingSide(state)
  return state.plateAppearance.pitcherCardKey ?? state.pregame[defense].defensiveAlignment.P ?? state.pregame[defense].startingPitcherCardKey ?? null
}

function snapshot(state: GameState): OpenPlay {
  return {
    inning: state.inning,
    half: state.half,
    outsBefore: state.outs,
    basesBefore: basesToRunners(state.bases),
    scoreBefore: { ...state.score },
    batterKey: state.plateAppearance.batterCardKey,
    pitcherKey: currentPitcherKey(state),
    runs: [],
    outs: [],
    steals: [],
    defense: [],
    outfieldAssists: [],
    batting: null,
    note: '',
  }
}

/** Starts a play (pitch roll, automatic advantage, steal, bunt, intentional walk) if none is open. */
export function openPlay(state: GameState): GameState {
  if (!state.playLog || state.playLog.open) return state
  return { ...state, playLog: { ...state.playLog, open: snapshot(state) } }
}

function withOpen(state: GameState, update: (open: OpenPlay) => OpenPlay): GameState {
  if (!state.playLog) return state
  // A fact with no open play (a direct engine call in a fixture) opens one at
  // the current state rather than losing the fact.
  const open = state.playLog.open ?? snapshot(state)
  return { ...state, playLog: { ...state.playLog, open: update(open) } }
}

export function recordRun(state: GameState, run: PlayRun): GameState {
  return withOpen(state, (open) => ({ ...open, runs: [...open.runs, run] }))
}

export function recordWinningRun(state: GameState, winningRun: NonNullable<OpenPlay['winningRun']>): GameState {
  return withOpen(state, (open) => ({ ...open, winningRun }))
}

export function recordSteal(state: GameState, steal: PlaySteal): GameState {
  return withOpen(state, (open) => ({ ...open, steals: [...open.steals, steal] }))
}

export function recordDefenseAttempt(state: GameState, attempt: PlayDefenseAttempt): GameState {
  return withOpen(state, (open) => ({ ...open, defense: [...open.defense, attempt] }))
}

export function recordOutfieldAssist(state: GameState, fielderKey: string): GameState {
  return withOpen(state, (open) => ({ ...open, outfieldAssists: [...open.outfieldAssists, fielderKey] }))
}

/** Explicit batting credit for plays the chart result alone can't classify (bunts, squeezes, intentional walks, fielder's choices). */
export function recordBattingCredit(state: GameState, credit: BattingCredit, note = ''): GameState {
  return withOpen(state, (open) => ({
    ...open,
    batting: { credit, chartResult: null, advantage: null, automaticAdvantage: false, gidp: false, rbi: 0 },
    note: note || open.note,
  }))
}

/** Where a runner began the open play, for scoring order and walk-off hit credit. */
export function startingBaseOf(state: GameState, cardKey: string): PlayRun['from'] {
  const open = state.playLog?.open
  const found = open?.basesBefore.find((runner) => runner.cardKey === cardKey)
  if (found) return found.base
  if (!open) {
    const live = basesToRunners(state.bases).find((runner) => runner.cardKey === cardKey)
    if (live) return live.base
  }
  return 'batter'
}

const HIT_BASES: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 }
const CREDIT_FOR_BASES: Record<number, BattingCredit> = { 1: 'single', 2: 'double', 3: 'triple', 4: 'home_run' }
const ADVANCE_FROM: Record<PlayRun['from'], number> = { third: 1, second: 2, first: 3, batter: 4 }

function chartCredit(chart: string | null): BattingCredit | null {
  switch (chart) {
    case 'K': return 'strikeout'
    case 'BB': return 'walk'
    case '1B': case '1B+': return 'single'
    case '2B': return 'double'
    case '3B': return 'triple'
    case 'HR': return 'home_run'
    default: return null
  }
}

/**
 * The batting classification of a completed plate appearance. Explicit
 * credits (bunts, squeezes, intentional walks, Infield In conversions) win;
 * otherwise the final converted chart result decides, with the outcome of a
 * GB or FB read from what happened on the play.
 */
function classifyPlateAppearance(state: GameState, open: OpenPlay): NonNullable<PlayRecord['batting']> {
  const pa = state.plateAppearance
  const chartResult = pa.chartResult
  const advantage = chartResult ? pa.advantage : null
  const automaticAdvantage = Boolean(chartResult && pa.advantage === 'pitcher' && pa.pitchRoll === null)
  const batterOnBase = open.batterKey !== null && basesToRunners(state.bases).some((runner) => runner.cardKey === open.batterKey)
  const batterScored = open.runs.some((run) => run.from === 'batter')
  const attempt = open.defense[0]
  const gidp = chartResult === 'GB' && attempt !== undefined && attempt.outsOnPlay === 2

  let credit: BattingCredit
  if (open.batting) credit = open.batting.credit
  else {
    const fromChart = chartCredit(chartResult)
    if (fromChart) credit = fromChart
    else if (chartResult === 'FB') {
      const scoredFromThird = open.runs.some((run) => run.counted && run.from === 'third')
      credit = scoredFromThird && open.outsBefore < 2 ? 'sacrifice_fly' : 'out'
    } else if (chartResult === 'GB') credit = batterOnBase || batterScored ? 'fielders_choice' : 'out'
    else credit = 'out'
  }

  // OBR 9.06(f): a game-ending hit (other than a home run) is credited only
  // with the bases the winning runner advanced (EDSR-WO; Anthony, 2026-11-01).
  let creditedFromChart: string | undefined
  if (open.winningRun && HIT_BASES[credit] && credit !== 'home_run') {
    const credited = Math.min(HIT_BASES[credit], ADVANCE_FROM[open.winningRun.from])
    if (credited < HIT_BASES[credit]) {
      creditedFromChart = credit
      credit = CREDIT_FOR_BASES[credited]
    }
  }

  // RBI (EDSR-RBI, Anthony 2026-11-01): every counted run on a completed
  // plate appearance, except during a ground-ball force double play.
  const counted = open.runs.filter((run) => run.counted).length
  const rbi = gidp ? 0 : counted
  return { credit, chartResult, advantage, automaticAdvantage, creditedFromChart, gidp, rbi }
}

/** Ends the open play and appends its record. `kind` says how it ended. */
export function closePlay(state: GameState, kind: 'plate_appearance' | 'baserunning'): GameState {
  const log = state.playLog
  if (!log) return state
  if (kind === 'baserunning') {
    if (!log.open) return state
    // A play that changed nothing (a squeeze with no runner left, a declined
    // second steal of home after its first steal was already recorded) leaves no record.
    const o = log.open
    if (!o.runs.length && !o.steals.length && o.outsBefore === state.outs) return { ...state, playLog: { ...log, open: null } }
  }
  const open = log.open ?? snapshot(state)
  const record: PlayRecord = {
    seq: log.plays.length + 1,
    kind,
    inning: open.inning,
    half: open.half,
    battingSide: open.half === 'top' ? 'away' : 'home',
    batterKey: open.batterKey,
    pitcherKey: open.pitcherKey,
    outsBefore: open.outsBefore,
    outsAfter: Math.min(3, state.outs),
    basesBefore: open.basesBefore,
    basesAfter: basesToRunners(state.bases),
    scoreBefore: open.scoreBefore,
    scoreAfter: { ...state.score },
    batting: kind === 'plate_appearance' ? classifyPlateAppearance(state, open) : undefined,
    runs: open.runs,
    outs: open.outs,
    steals: open.steals,
    defense: open.defense,
    outfieldAssists: open.outfieldAssists,
    winningRun: open.winningRun,
    rulesVersion: rulesVersionOf(state),
    note: open.note,
  }
  return { ...state, playLog: { ...log, plays: [...log.plays, record], open: null } }
}

/** A substitution or position change, recorded on its own as it happens. */
export function recordSubstitution(
  state: GameState,
  sub: { side: GameSide; kind: string; incomingKey: string; outgoingKey: string | null; position: string | null },
): GameState {
  const log = state.playLog
  if (!log) return state
  const runnersOn = basesToRunners(state.bases).length
  const record: PlayRecord = {
    seq: log.plays.length + 1,
    kind: 'substitution',
    inning: state.inning,
    half: state.half,
    battingSide: battingSide(state),
    batterKey: state.plateAppearance.batterCardKey,
    pitcherKey: currentPitcherKey(state),
    outsBefore: state.outs,
    outsAfter: state.outs,
    basesBefore: basesToRunners(state.bases),
    basesAfter: basesToRunners(state.bases),
    scoreBefore: { ...state.score },
    scoreAfter: { ...state.score },
    runs: [],
    outs: [],
    steals: [],
    defense: [],
    outfieldAssists: [],
    substitution: { ...sub, scoreBefore: { ...state.score }, runnersOn },
    rulesVersion: rulesVersionOf(state),
    note: '',
  }
  return { ...state, playLog: { ...log, plays: [...log.plays, record] } }
}

/** Seeds the log at the first pitch of a rules-v2 game with both line-ups. */
export function startPlayLog(state: GameState): GameState {
  const start = {} as NonNullable<GameState['playLog']>['start'] & object
  for (const side of ['home', 'away'] as GameSide[]) {
    const pregame = state.pregame[side]
    start[side] = {
      battingOrder: [...pregame.battingOrderCardKeys],
      alignment: { ...pregame.defensiveAlignment },
      startingPitcher: pregame.defensiveAlignment.P ?? pregame.startingPitcherCardKey,
    }
  }
  return { ...state, playLog: { plays: [], open: null, start } }
}
