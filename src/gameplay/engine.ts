import { cloneSeasonConfiguration, type ActiveSeasonConfiguration } from './seasonConfig'
import { canStartAtPosition } from './defense'
import { resolveCoreResult, resolveSwingChart } from './coreGame'
import { effectiveHitterOnBase, effectivePitcherControl, type PitcherFatigueInput } from './fatigueEngine'
import { readPitcherStateValue } from './pitcherStateKey'
import { openingStints } from './pitcherMound'
import { openPlay, startPlayLog } from './playLog'
import { recordPitchFacts } from './restFacts'
import { CURRENT_RULES_VERSION, rulesVersionOf, usesRulesV2 } from './rulesVersion'
import { awaitingOffenseReady } from './turnOrder'
import type {
  GameManagerSnapshot,
  GameState,
  GameSide,
  PregameManagerState,
  GameRosterSnapshot,
  DefensivePosition,
  GameCardSnapshot,
} from './types'

function nowIso(): string {
  return new Date().toISOString()
}

function emptyPregame(side: GameSide, manager: GameManagerSnapshot): PregameManagerState {
  return {
    side,
    manager,
    roster: null,
    startingPitcherCardKey: null,
    defaultBatterCardKeys: [],
    defaultPitcherCardKeys: [],
    battingOrderCardKeys: [],
    defensiveAlignment: {},
    submittedAt: null,
    locked: false,
  }
}

export function createInitialGameState(args: {
  gameId: string
  configuration: ActiveSeasonConfiguration
  homeManager: GameManagerSnapshot
  awayManager: GameManagerSnapshot
  createdAt?: string
}): GameState {
  const createdAt = args.createdAt ?? nowIso()

  return {
    gameId: args.gameId,
    stateVersion: 1,
    rulesVersion: CURRENT_RULES_VERSION,
    status: 'pregame',
    configuration: cloneSeasonConfiguration(args.configuration),
    managers: {
      home: structuredClone(args.homeManager),
      away: structuredClone(args.awayManager),
    },
    pregame: {
      home: emptyPregame('home', args.homeManager),
      away: emptyPregame('away', args.awayManager),
    },
    inning: 1,
    half: 'top',
    outs: 0,
    score: { home: 0, away: 0 },
    runsByInning: { home: [], away: [] },
    bases: { first: null, second: null, third: null },
    plateAppearance: {
      batterCardKey: null,
      pitcherCardKey: null,
      pitchRoll: null,
      pitchTotal: null,
      advantage: null,
      swingRoll: null,
      chartResult: null,
    },
    pendingDecision: null,
    lineupCursor: { home: 0, away: 0 },
    waitingFor: null,
    nextActor: null,
    naturalStolenBaseUsed: { home:false, away:false },
    firstPitchThrown: false,
    appearedCardKeys: { home:[], away:[] },
    hitterPlateAppearanceCardKeys: { home:[], away:[] },
    pitcherAppearanceCardKeys: { home:[], away:[] },
    pitcherEntryDefenseOuts: {},
    pitcherRunsAllowed: {},
    pitcherShutoutBonusBrokenAtOuts: {},
    paused: {
      pausedAt: null,
      pausedByUserId: null,
      resumeStatus: null,
    },
    createdAt,
    updatedAt: createdAt,
  }
}

function withVersion(state: GameState, next: GameState): GameState {
  return {
    ...next,
    stateVersion: state.stateVersion + 1,
    updatedAt: nowIso(),
  }
}

export function attachPregameRoster(
  state: GameState,
  side: GameSide,
  roster: GameRosterSnapshot,
): GameState {
  if (state.status !== 'pregame') throw new Error('Rosters can only be attached during pregame.')
  if (state.pregame[side].locked) throw new Error('This manager has already locked pregame selections.')

  return withVersion(state, {
    ...state,
    pregame: {
      ...state.pregame,
      [side]: {
        ...state.pregame[side],
        roster: structuredClone(roster),
      },
    },
  })
}

export function setPregameSelections(
  state: GameState,
  side: GameSide,
  selections: {
    startingPitcherCardKey: string
    defaultBatterCardKeys?: string[]
    battingOrderCardKeys?: string[]
    defensiveAlignment?: Partial<Record<DefensivePosition, string>>
  },
): GameState {
  if (state.status !== 'pregame') throw new Error('Pregame selections can only be changed during pregame.')
  const pregame = state.pregame[side]
  if (pregame.locked) throw new Error('This manager has already locked pregame selections.')
  if (!pregame.roster) throw new Error('Select an eligible roster before making pregame selections.')

  const rosterCards = pregame.roster.cards
  if (!rosterCards[selections.startingPitcherCardKey]) {
    throw new Error('Starting pitcher must be part of the frozen game roster.')
  }
  if (rosterCards[selections.startingPitcherCardKey].pitcher.control === null) {
    throw new Error('Starting pitcher must have a pitcher Control rating.')
  }

  const defaultBatterCardKeys = [...new Set(selections.defaultBatterCardKeys ?? [])]
  for (const cardKey of defaultBatterCardKeys) {
    const card = rosterCards[cardKey]
    if (!card) throw new Error('Every default batter must be part of the frozen game roster.')
    if (card.hitter.onBase === null) throw new Error(`${card.playerName} does not have a hitter On Base rating.`)
  }

  const battingOrderCardKeys = selections.battingOrderCardKeys ?? pregame.battingOrderCardKeys
  const defensiveAlignment = selections.defensiveAlignment ?? pregame.defensiveAlignment

  if (battingOrderCardKeys.length > 0) {
    if (battingOrderCardKeys.length !== 9 || new Set(battingOrderCardKeys).size !== 9) {
      throw new Error('Game batting order must contain exactly 9 unique players.')
    }
    for (const cardKey of battingOrderCardKeys) {
      const card = rosterCards[cardKey]
      if (!card || card.hitter.onBase === null) throw new Error('Every batting-order player must have a valid hitter side.')
    }
    if (!pregame.roster.useDh && !battingOrderCardKeys.includes(selections.startingPitcherCardKey)) {
      throw new Error('With DH OFF, the selected starting pitcher must appear in the 9-player batting order.')
    }
  }

  if (Object.keys(defensiveAlignment).length > 0) {
    const required: DefensivePosition[] = pregame.roster.useDh
      ? ['C','1B','2B','3B','SS','LF','CF','RF','P','DH']
      : ['C','1B','2B','3B','SS','LF','CF','RF','P']

    for (const position of required) {
      const cardKey = defensiveAlignment[position]
      if (!cardKey) throw new Error(`Assign a player at ${position} before locking pregame.`)
      const card = rosterCards[cardKey]
      if (!card) throw new Error(`The ${position} assignment must be part of the frozen game roster.`)
      if (!canStartAtPosition(card, position)) {
        if (position === 'P') throw new Error('The P defensive assignment must have a valid pitcher chart.')
        if (position === 'DH') throw new Error('The DH assignment must have a valid hitter chart.')
        throw new Error(`${card.playerName} has no ${position} fielding score on his card, and starters may only start at a listed position.`)
      }
      // Starters only at listed positions (Rulebook V). Unlisted positions at
      // -10 open in-game, after the first plate appearance -- not here.
    }

    const assignedKeys = required.map((position) => defensiveAlignment[position] as string)
    if (new Set(assignedKeys).size !== assignedKeys.length) {
      throw new Error('A player cannot occupy two defensive positions at the same time.')
    }

    if (defensiveAlignment.P !== selections.startingPitcherCardKey) {
      throw new Error('The P defensive assignment must match the selected starting pitcher.')
    }

    if (battingOrderCardKeys.length === 9) {
      const battingSet = new Set(battingOrderCardKeys)
      const battingDefensePositions: DefensivePosition[] = pregame.roster.useDh
        ? ['C','1B','2B','3B','SS','LF','CF','RF','DH']
        : ['C','1B','2B','3B','SS','LF','CF','RF','P']
      const defenseBatters = battingDefensePositions.map((position) => defensiveAlignment[position] as string)
      if (defenseBatters.some((cardKey) => !battingSet.has(cardKey)) || new Set(defenseBatters).size !== 9) {
        throw new Error('The game batting order must contain the same nine players assigned to the batting defensive roles.')
      }
    }
  }

  return withVersion(state, {
    ...state,
    pregame: {
      ...state.pregame,
      [side]: {
        ...pregame,
        startingPitcherCardKey: selections.startingPitcherCardKey,
        defaultBatterCardKeys,
        battingOrderCardKeys: [...battingOrderCardKeys],
        defensiveAlignment: { ...defensiveAlignment },
      },
    },
  })
}

export function lockPregame(state: GameState, side: GameSide): GameState {
  if (state.status !== 'pregame') throw new Error('Pregame can only be locked before the game begins.')
  const pregame = state.pregame[side]
  if (!pregame.roster) throw new Error('An eligible roster is required before locking pregame.')
  if (!pregame.startingPitcherCardKey) throw new Error('A starting pitcher is required before locking pregame.')
  if (pregame.battingOrderCardKeys.length !== 9) throw new Error('A valid 9-player game batting order is required before locking pregame.')
  if (!pregame.defensiveAlignment.P) throw new Error('A valid game defensive alignment is required before locking pregame.')

  const nextPregame = {
    ...state.pregame,
    [side]: {
      ...pregame,
      locked: true,
      submittedAt: nowIso(),
    },
  }

  const bothLocked = nextPregame.home.locked && nextPregame.away.locked

  return withVersion(state, {
    ...state,
    status: bothLocked ? 'ready' : 'pregame',
    pregame: nextPregame,
  })
}

export function startGame(state: GameState): GameState {
  if (state.status !== 'ready') throw new Error('Both managers must lock pregame before the game can start.')

  const awayLineup = state.pregame.away.battingOrderCardKeys
  const homePitcher = state.pregame.home.startingPitcherCardKey
  const firstBatter = awayLineup?.[0] ?? null

  if (!firstBatter || !homePitcher) {
    throw new Error('The game snapshot is missing the leadoff hitter or home starting pitcher.')
  }

  const started = usesRulesV2(state) ? startPlayLog(state) : state
  return withVersion(state, {
    ...started,
    status: 'in_progress',
    lineupCursor: { home: 0, away: 0 },
    naturalStolenBaseUsed: { home:false, away:false },
    pitcherStint: openingStints(state),
    appearedCardKeys: {
      away:[...new Set([...state.pregame.away.battingOrderCardKeys, ...Object.values(state.pregame.away.defensiveAlignment).filter(Boolean) as string[]])],
      home:[...new Set([...state.pregame.home.battingOrderCardKeys, ...Object.values(state.pregame.home.defensiveAlignment).filter(Boolean) as string[]])],
    },
    waitingFor: 'PITCH_ROLL',
    nextActor: 'home',
    plateAppearance: {
      batterCardKey: firstBatter,
      pitcherCardKey: homePitcher,
      pitchRoll: null,
      pitchTotal: null,
      advantage: null,
      swingRoll: null,
      chartResult: null,
    },
  })
}


/**
 * PRIVATE LAB ONLY.
 * Phase 1D needs both sides of pregame locked before the real engine can start.
 * Until the second manager is enabled in the lab, this helper copies the tester's
 * validated/locked baseball setup to the opponent side as an explicit development
 * fixture. It must never be used by production game creation.
 */
export function preparePrivateLabOpponentFixture(state: GameState): GameState {
  if (state.status !== 'pregame') throw new Error('The private opponent fixture can only be prepared during pregame.')
  const home = state.pregame.home
  if (!home.locked || !home.roster || !home.startingPitcherCardKey) {
    throw new Error('Lock your complete pregame setup before initializing the private test fixture.')
  }
  if (home.battingOrderCardKeys.length !== 9) {
    throw new Error('A valid 9-player batting order is required before initializing the private test fixture.')
  }

  const fixture: PregameManagerState = {
    ...structuredClone(home),
    side: 'away',
    manager: structuredClone(state.managers.away),
    submittedAt: nowIso(),
    locked: true,
  }

  return withVersion(state, {
    ...state,
    status: 'ready',
    pregame: {
      ...state.pregame,
      away: fixture,
    },
  })
}


function normalizeHand(value: string | null): 'R' | 'L' | 'S' | null {
  if (!value) return null
  const hand = value.trim().toUpperCase()
  if (hand.startsWith('R')) return 'R'
  if (hand.startsWith('L')) return 'L'
  if (hand.startsWith('S') || hand.includes('SWITCH')) return 'S'
  return null
}

function battingSide(state: GameState): GameSide {
  return state.half === 'top' ? 'away' : 'home'
}

function fieldingSide(state: GameState): GameSide {
  return state.half === 'top' ? 'home' : 'away'
}

function resolveEqualPitchAdvantage(args: {
  pitcherArm: string | null
  hitterBats: string | null
}): 'hitter' | 'pitcher' {
  const pitcher = normalizeHand(args.pitcherArm)
  const hitter = normalizeHand(args.hitterBats)

  // Elements Rulebook §2.3.1.3:
  // switch hitter -> hitter chart; switch pitcher vs one-sided hitter -> pitcher chart.
  if (hitter === 'S') return 'hitter'
  if (pitcher === 'S' && (hitter === 'R' || hitter === 'L')) return 'pitcher'

  // Same-handed matchup -> pitcher chart; opposite-handed matchup -> hitter chart.
  if (pitcher && hitter) return pitcher === hitter ? 'pitcher' : 'hitter'

  throw new Error('Pitch total tied On Base, but handedness is missing or unrecognized for platoon resolution.')
}

/**
 * Outs a side has recorded ON DEFENSE. Home defends top halves, away defends
 * bottom halves, so each side's count is 3 per fully-completed half of its own
 * plus whatever it has recorded in a half currently in progress.
 *
 * The `half === 'bottom'` case for home is the one worth stating: the top half
 * is over by then, so home has a completed half in the CURRENT inning that
 * `(inning - 1) * 3` does not count. Every caller before the post-game summary
 * only ever asked about the side that was fielding at that moment -- live
 * fatigue via `fieldingSide()`, pitcher entry-outs on a defensive substitution
 * -- and for the fielding side this returns exactly what it always did. A
 * summary asks about both sides at once, which is what surfaced it.
 */
export function defensiveOutsRecorded(state: GameState, side: GameSide): number {
  const completedInnings = (state.inning - 1) * 3
  const defendsCurrentHalf = side === (state.half === 'top' ? 'home' : 'away')
  if (defendsCurrentHalf) return completedInnings + state.outs
  // Not defending the half in progress: home has already finished this
  // inning's top half; away has not yet started this inning's bottom half.
  return completedInnings + (side === 'home' ? 3 : 0)
}

/**
 * Persistent cross-game rest debt for one card, from state.restState (see
 * attachRestState below). Missing side/card both mean fully rested (0), the
 * same "no row yet = never played" default player_rest_state itself uses.
 */
function hitterGamesFromRested(state: GameState, side: GameSide, cardKey: string): number {
  return state.restState?.[side]?.[cardKey]?.hitterGamesRemaining ?? 0
}
function pitcherGamesFromRested(state: GameState, side: GameSide, cardKey: string): number {
  return state.restState?.[side]?.[cardKey]?.pitcherGamesRemaining ?? 0
}

/**
 * The exact fatigue inputs the live plate appearance feeds to fatigueEngine.ts.
 * Extracted (Phase 1, GAMEPLAY_PRESENTATION_PLAN.md) so the presentation layer
 * can explain *why* a rating moved without rebuilding this input-gathering
 * itself -- a second copy would be free to drift from the numbers real rolls
 * actually use. Pure reads of already-resolved state; no resolution logic here,
 * and effectiveCurrent* below stay the only callers that turn it into a rating.
 */
export type CurrentHitterFatigueContext = {
  card: GameCardSnapshot
  printedOnBase: number | null
  gamesFromRested: number
  useDefaultAttributes: boolean
}

export function currentHitterFatigueContext(state: GameState): CurrentHitterFatigueContext | null {
  const offense=battingSide(state)
  const key=state.plateAppearance.batterCardKey
  const batter=key?state.pregame[offense].roster?.cards[key]:null
  if(!batter)return null
  return {
    card: batter,
    printedOnBase: batter.hitter.onBase,
    gamesFromRested: hitterGamesFromRested(state,offense,batter.cardKey),
    useDefaultAttributes: state.pregame[offense].defaultBatterCardKeys.includes(batter.cardKey)||batter.hitter.onBase===null,
  }
}

export function effectiveCurrentHitterOnBase(state: GameState): number {
  const context=currentHitterFatigueContext(state)
  if(!context)return 5
  return effectiveHitterOnBase(context.printedOnBase,context.gamesFromRested,context.useDefaultAttributes)
}

export type CurrentPitcherFatigueContext = {
  card: GameCardSnapshot
  input: PitcherFatigueInput
}

export function currentPitcherFatigueContext(state: GameState): CurrentPitcherFatigueContext | null {
  const defense=fieldingSide(state)
  const key=state.plateAppearance.pitcherCardKey
  const pitcher=key?state.pregame[defense].roster?.cards[key]:null
  if(!pitcher)return null
  return { card: pitcher, input: pitcherFatigueInputFor(state, defense, pitcher.cardKey)! }
}

/**
 * The fatigue inputs a pitcher has -- or would have, if he took the mound
 * right now. For the pitcher on the mound this is exactly what the live roll
 * uses. For anyone else it is what he would enter with: rest debt from earlier
 * games, plus, for a pitcher returning to the mound, the outs and runs of his
 * line so far (MLB 5.10, pitcherMound.ts). This is what the bullpen, the
 * pregame and every replacement option show, so a manager never picks a
 * pitcher on a number he will not pitch with. Card attributes are assumed;
 * the default-attributes choice is made on entry and labelled there.
 */
export function pitcherFatigueInputFor(state: GameState, side: GameSide, cardKey: string): PitcherFatigueInput | null {
  const pitcher=state.pregame[side].roster?.cards[cardKey]
  if(!pitcher)return null
  const useDefault=(state.pregame[side].defaultPitcherCardKeys?.includes(cardKey)??false)||pitcher.pitcher.control===null
  const entry=readPitcherStateValue(state.pitcherEntryDefenseOuts,side,cardKey)??0
  const onMound=state.plateAppearance.pitcherCardKey===cardKey&&fieldingSide(state)===side
    || state.pregame[side].defensiveAlignment.P===cardKey
  const exit=readPitcherStateValue(state.pitcherExitDefenseOuts,side,cardKey)
  const pitched=onMound||exit!==undefined
  const outs=!pitched?0:onMound?Math.max(0,defensiveOutsRecorded(state,side)-entry):Math.max(0,(exit??entry)-entry)
  return {
    printedControl: pitcher.pitcher.control,
    useDefaultAttributes: useDefault,
    gamesFromRested: pitcherGamesFromRested(state,side,cardKey),
    cardIp: pitcher.pitcher.ip,
    outsRecorded: outs,
    earnedRunsAllowed: pitched?(readPitcherStateValue(state.pitcherRunsAllowed,side,cardKey)??0):0,
    shutoutBonusBrokenAtOuts: pitched?readPitcherStateValue(state.pitcherShutoutBonusBrokenAtOuts,side,cardKey):undefined,
    ...(usesRulesV2(state) ? {
      rulesVersion: rulesVersionOf(state),
      inheritedRunnersScored: pitched?(readPitcherStateValue(state.pitcherInheritedRunsScored,side,cardKey)??0):0,
      shutoutBonusEndedAtOuts: pitched?readPitcherStateValue(state.pitcherShutoutBonusEndedAtOuts,side,cardKey):undefined,
    } : {}),
  }
}

/** The On Base a hitter has, or would have if he came up now: card less rest debt. */
export function hitterOnBaseFor(state: GameState, side: GameSide, cardKey: string): { printed: number | null; effective: number; gamesFromRested: number } | null {
  const card=state.pregame[side].roster?.cards[cardKey]
  if(!card)return null
  const gamesFromRested=hitterGamesFromRested(state,side,cardKey)
  const useDefault=state.pregame[side].defaultBatterCardKeys.includes(cardKey)||card.hitter.onBase===null
  return { printed: card.hitter.onBase, effective: effectiveHitterOnBase(card.hitter.onBase,gamesFromRested,useDefault), gamesFromRested }
}

export function effectiveCurrentPitcherControl(state: GameState): number {
  const context=currentPitcherFatigueContext(state)
  if(!context)return -5
  return effectivePitcherControl(context.input)
}

/**
 * Attaches one side's already-fetched player_rest_state rows to the game.
 * Pure -- the actual Supabase read (RLS-scoped to that manager's own rows)
 * happens in the calling page, same pattern as setPregameSelections. Meant
 * to be called once per side during pregame, before the roster snapshot's
 * numbers are ever read for a real roll -- an in-progress game does not
 * re-fetch this live, matching the roster snapshot's own freeze.
 */
export function attachRestState(
  state: GameState,
  side: GameSide,
  restStateForSide: Record<string, { hitterGamesRemaining: number; pitcherGamesRemaining: number }>,
): GameState {
  return {
    ...state,
    restState: { ...state.restState, [side]: restStateForSide },
  }
}

export function pitcherAdvantageIsAutomatic(state: GameState): boolean {
  const control=effectiveCurrentPitcherControl(state)
  const onBase=effectiveCurrentHitterOnBase(state)
  const minimumPitchTotal=control+1
  if(minimumPitchTotal>onBase)return true
  if(minimumPitchTotal<onBase)return false

  // If even a natural 1 only ties OB, NO PITCH is still valid when the Rulebook
  // handedness tiebreak gives that tie to the pitcher (e.g. C5R vs OB6R).
  const offense=battingSide(state)
  const defense=fieldingSide(state)
  const batterKey=state.plateAppearance.batterCardKey
  const pitcherKey=state.plateAppearance.pitcherCardKey
  const batter=batterKey?state.pregame[offense].roster?.cards[batterKey]:null
  const pitcher=pitcherKey?state.pregame[defense].roster?.cards[pitcherKey]:null
  if(!batter||!pitcher)return false
  try {
    return resolveEqualPitchAdvantage({
      pitcherArm:pitcher.pitcher.arm??pitcher.hitter.bats,
      hitterBats:batter.hitter.bats??batter.pitcher.arm,
    })==='pitcher'
  } catch {
    return false
  }
}

export function resolveAutomaticPitcherAdvantage(state: GameState): GameState {
  if(state.status!=='in_progress'||state.waitingFor!=='PITCH_ROLL')throw new Error('Automatic advantage is only available before the pitch roll.')
  if(!pitcherAdvantageIsAutomatic(state))throw new Error('Pitcher advantage is not automatic in this matchup.')
  if(awaitingOffenseReady(state))throw new Error('The batting manager has not declared ready.')
  const pitched=recordPitchFacts(openPlay(state),fieldingSide(state),state.plateAppearance.pitcherCardKey,effectiveCurrentPitcherControl(state))
  return withVersion(state,{...pitched,firstPitchThrown:true,waitingFor:'SWING_ROLL',nextActor:battingSide(state),plateAppearance:{...state.plateAppearance,pitchRoll:null,pitchTotal:null,advantage:'pitcher',swingRoll:null,chartResult:null}})
}

/** Two-player games: the batting manager is done with pre-pitch calls. See turnOrder.ts. */
export function declareOffenseReady(state: GameState): GameState {
  if (!awaitingOffenseReady(state)) throw new Error('The batting manager is not being waited on.')
  return withVersion(state, { ...state, plateAppearance: { ...state.plateAppearance, offenseReady: true } })
}

export function resolvePitchRoll(state: GameState, roll: number): GameState {
  if (state.status !== 'in_progress') throw new Error('A pitch can only be rolled while the game is in progress.')
  if (state.waitingFor !== 'PITCH_ROLL') throw new Error('The game is not currently waiting for a pitch roll.')
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) throw new Error('Pitch roll must be a whole number from 1 to 20.')

  const offense = battingSide(state)
  const defense = fieldingSide(state)
  if (state.nextActor !== defense) throw new Error('The defensive side must act for the pitch roll.')
  if (awaitingOffenseReady(state)) throw new Error('The batting manager has not declared ready.')

  const batterKey = state.plateAppearance.batterCardKey
  const pitcherKey = state.plateAppearance.pitcherCardKey
  const batter = batterKey ? state.pregame[offense].roster?.cards[batterKey] : null
  const pitcher = pitcherKey ? state.pregame[defense].roster?.cards[pitcherKey] : null
  if (!batter || !pitcher) throw new Error('Current batter or pitcher is missing from the frozen game roster.')

  // Rulebook chartless/default attributes are an engine-level fallback, not a bot-only policy.
  // A player explicitly locked to Default Attributes uses them even when the printed side exists.
  // A player with no printed Control automatically pitches at Control -5; a player with no
  // printed On Base automatically bats at On Base 5.
  const control = effectiveCurrentPitcherControl(state)
  const onBase = effectiveCurrentHitterOnBase(state)

  const pitchTotal = roll + control
  const advantage =
    pitchTotal > onBase
      ? 'pitcher'
      : pitchTotal < onBase
        ? 'hitter'
        : resolveEqualPitchAdvantage({
            // Chartless handedness follows the populated side of the card:
            // position player pitching -> Bats; pitcher batting -> Arm.
            pitcherArm: pitcher.pitcher.arm ?? pitcher.hitter.bats,
            hitterBats: batter.hitter.bats ?? batter.pitcher.arm,
          })

  const pitched = recordPitchFacts(openPlay(state), defense, pitcherKey, control)
  return withVersion(state, {
    ...pitched,
    firstPitchThrown: true,
    waitingFor: 'SWING_ROLL',
    nextActor: offense,
    plateAppearance: {
      ...state.plateAppearance,
      pitchRoll: roll,
      pitchTotal,
      advantage,
      swingRoll: null,
      chartResult: null,
    },
  })
}


export function resolveSwingRoll(state: GameState, roll: number): GameState {
  if (state.status !== 'in_progress') throw new Error('A swing can only be rolled while the game is in progress.')
  if (state.waitingFor !== 'SWING_ROLL') throw new Error('The game is not currently waiting for a swing roll.')
  const offense = battingSide(state)
  if (state.nextActor !== offense) throw new Error('The offensive side must act for the swing roll.')
  const result = resolveSwingChart(state, roll)
  const rolled = withVersion(state, {
    ...state,
    plateAppearance: {...state.plateAppearance, swingRoll:roll, chartResult:result},
  })
  return resolveCoreResult(rolled, result)
}

/**
 * Pause was removed from the game (2026-10-31); nothing sets `paused` any more.
 * This stays so a game paused before then can be returned to the exact status
 * it was paused from (presentation/legacyPause.ts).
 */
export function resumeGame(state: GameState): GameState {
  if (state.status !== 'paused') throw new Error('Only a paused game can be resumed.')
  if (!state.paused.resumeStatus) throw new Error('Paused game is missing its resume state.')

  return withVersion(state, {
    ...state,
    status: state.paused.resumeStatus,
    paused: {
      pausedAt: null,
      pausedByUserId: null,
      resumeStatus: null,
    },
  })
}

export function assertExpectedStateVersion(state: GameState, expectedVersion: number): void {
  if (state.stateVersion !== expectedVersion) {
    throw new Error(`Stale game action. Expected state version ${expectedVersion}, current version is ${state.stateVersion}.`)
  }
}

