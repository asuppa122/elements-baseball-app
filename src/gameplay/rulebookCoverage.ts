import { runGameplayDemoVerification } from './gameplayDemoScenarios'
import { runGroundBallScenarioMatrix } from './groundBallScenarioHarness'
import { runFatigueScenarioMatrix } from './fatigueScenarioHarness'
import { runRestTrackingScenarioMatrix } from './restTrackingScenarioHarness'
import { runPaMarkerScenarioMatrix } from './paMarkerScenarioHarness'
import { runGameBoundaryScenarioMatrix } from './gameBoundaryScenarioHarness'
import { runNonGbScenarioMatrix, type ScenarioReport, type ScenarioResult } from './scenarioHarness'
import { ACTIVE_SEASON_CONFIG } from './seasonConfig'
import type { GameCardSnapshot, GameRosterSnapshot, GameSide, GameState } from './types'

export type CoverageLayer = 'deterministic' | 'interaction' | 'interactive' | 'rules_demo' | 'full_game' | 'statistical'

export type CoverageCase = {
  id: string
  mechanic: string
  ruleSection: string
  description: string
  passed: boolean
  detail: string
  source: 'demo' | 'non_gb_matrix' | 'ground_ball_matrix' | 'fatigue_matrix' | 'rest_tracking_matrix' | 'pa_marker_matrix' | 'boundary_matrix'
}

export type MechanicCoverage = {
  mechanic: string
  passed: number
  total: number
  cases: CoverageCase[]
}

export type RulebookCoverageReport = {
  total: number
  passed: number
  failed: number
  mechanics: MechanicCoverage[]
  cases: CoverageCase[]
  layers: Record<CoverageLayer, { status: 'active' | 'planned' | 'conditional'; description: string }>
}


function coverageCard(side: GameSide, index: number): GameCardSnapshot {
  const key = `${side.toUpperCase()}-${index}`
  return {
    cardKey: key, playerName: `${side} fixture ${index}`, imageUrl: null, year: 1925, points: 100,
    hitter: {
      bats: index % 2 ? 'R' : 'L', onBase: 8 + (index % 3), fatigue: null, baserunning: 12 + (index % 5), stolenBase: 10 + (index % 4),
      chart: { PU:'1-2', K:'3-5', GB:'6-8', FB:'9-11', BB:'12', '1B':'13-15', '1B+':'16', '2B':'17-18', '3B':'19', HR:'20' },
    },
    pitcher: {
      arm: index % 2 ? 'R' : 'L', control: 3 + (index % 3), fatigue: null, ip: index === 8 ? 7.33 : 5.67,
      chart: { PU:'1-3', K:'4-8', GB:'9-12', FB:'13-15', BB:'16', '1B':'17-18', '2B':'19', '3B':null, HR:'20' },
    },
    defense: { C: index===0 ? 1 : 0, '1B':1, '2B':1, '3B':1, SS:1, LF:1, CF:2, RF:1 },
  }
}

function coverageRoster(side: GameSide): GameRosterSnapshot {
  const cards = Object.fromEntries(Array.from({ length: 18 }, (_, i) => { const card=coverageCard(side,i); return [card.cardKey,card] }))
  return {
    sourceLineupId:`coverage-${side}`, sourceLineupName:`Coverage ${side}`, capturedAt:'2026-08-23T00:00:00.000Z',
    rosterFormat:'compact', useDh:false, seasonEligibleOnly:true, playerCount:18, totalPoints:1800, assignments:{}, cards,
  }
}

// Exported for reuse by the Vitest port of scenarioHarness.ts's own suite
// (src/gameplay/__tests__/scenarioHarness.test.ts) — same fixture, one source of truth.
export function buildNonGbCoverageFixture(): GameState {
  const awayRoster=coverageRoster('away'), homeRoster=coverageRoster('home')
  const makePre=(side:GameSide, roster:GameRosterSnapshot)=>({
    side, manager:{userId:`coverage-${side}`,managerName:`Coverage ${side}`}, roster, startingPitcherCardKey:`${side.toUpperCase()}-8`,
    defaultBatterCardKeys:[], defaultPitcherCardKeys:[],
    battingOrderCardKeys:Array.from({length:9},(_,i)=>`${side.toUpperCase()}-${i}`),
    defensiveAlignment:{C:`${side.toUpperCase()}-0`,'1B':`${side.toUpperCase()}-1`,'2B':`${side.toUpperCase()}-2`,'3B':`${side.toUpperCase()}-3`,SS:`${side.toUpperCase()}-4`,LF:`${side.toUpperCase()}-5`,CF:`${side.toUpperCase()}-6`,RF:`${side.toUpperCase()}-7`,P:`${side.toUpperCase()}-8`},
    submittedAt:'2026-08-23T00:00:00.000Z', locked:true,
  })
  return {
    gameId:'coverage-fixture', stateVersion:1, status:'in_progress', configuration:structuredClone(ACTIVE_SEASON_CONFIG),
    managers:{away:{userId:'coverage-away',managerName:'Coverage away'},home:{userId:'coverage-home',managerName:'Coverage home'}},
    pregame:{away:makePre('away',awayRoster),home:makePre('home',homeRoster)}, inning:1, half:'top', outs:0, score:{away:0,home:0},
    bases:{first:null,second:null,third:null},
    plateAppearance:{batterCardKey:'AWAY-0',pitcherCardKey:'HOME-8',pitchRoll:null,pitchTotal:null,advantage:null,swingRoll:null,chartResult:null,infieldIn:false},
    pendingDecision:null,lineupCursor:{away:0,home:0},outfieldThrowUsage:{away:{LF:0,CF:0,RF:0},home:{LF:0,CF:0,RF:0}},
    infieldDoublePlayUsage:{away:{'1B+2B+SS':0,'1B+2B+3B':0,'1B+3B+SS':0},home:{'1B+2B+SS':0,'1B+2B+3B':0,'1B+3B+SS':0}},
    naturalStolenBaseUsed:{away:false,home:false},appearedCardKeys:{away:Array.from({length:9},(_,i)=>`AWAY-${i}`),home:Array.from({length:9},(_,i)=>`HOME-${i}`)},
    pitcherEntryDefenseOuts:{},pitcherRunsAllowed:{},pitcherShutoutBonusBrokenAtOuts:{},waitingFor:'PITCH_ROLL',nextActor:'home',
    paused:{pausedAt:null,pausedByUserId:null,resumeStatus:null},createdAt:'2026-08-23T00:00:00.000Z',updatedAt:'2026-08-23T00:00:00.000Z',
  }
}

function normalizeReport(report: ScenarioReport, source: CoverageCase['source'], ruleSection: string): CoverageCase[] {
  return report.results.map((result: ScenarioResult) => ({
    id: result.id,
    mechanic: result.category,
    ruleSection,
    description: result.description,
    passed: result.passed,
    detail: result.detail,
    source,
  }))
}

export function runRulebookCoverage(): RulebookCoverageReport {
  const demoCases: CoverageCase[] = runGameplayDemoVerification().map(({ scenario, result }) => ({
    id: `DEMO-${scenario.id.toUpperCase().replaceAll('-', '_')}`,
    mechanic: scenario.category,
    ruleSection: scenario.ruleSection,
    description: scenario.expected,
    passed: result.passed,
    detail: result.detail,
    source: 'demo',
  }))

  // Ground-ball tests do not depend on a live fixture; the argument is retained only
  // for compatibility with the original matrix signature.
  const nonGb = normalizeReport(runNonGbScenarioMatrix(buildNonGbCoverageFixture()), 'non_gb_matrix', 'Rulebook deterministic non-GB')
  const groundBall = normalizeReport(runGroundBallScenarioMatrix(undefined as never), 'ground_ball_matrix', 'VII')
  const fatigue = normalizeReport(runFatigueScenarioMatrix(), 'fatigue_matrix', 'VIII')
  const restTracking = normalizeReport(runRestTrackingScenarioMatrix(), 'rest_tracking_matrix', 'Online League Structure / VIII')
  const paMarker = normalizeReport(runPaMarkerScenarioMatrix(buildNonGbCoverageFixture()), 'pa_marker_matrix', 'VIII (fatigue-accrual wiring)')
  const boundary = normalizeReport(runGameBoundaryScenarioMatrix(), 'boundary_matrix', 'Game / season boundaries')
  const cases = [...demoCases, ...nonGb, ...groundBall, ...fatigue, ...restTracking, ...paMarker, ...boundary]

  const byMechanic = new Map<string, CoverageCase[]>()
  for (const item of cases) {
    const list = byMechanic.get(item.mechanic) ?? []
    list.push(item)
    byMechanic.set(item.mechanic, list)
  }
  const mechanics: MechanicCoverage[] = [...byMechanic.entries()]
    .map(([mechanic, mechanicCases]) => ({
      mechanic,
      total: mechanicCases.length,
      passed: mechanicCases.filter((item) => item.passed).length,
      cases: mechanicCases,
    }))
    .sort((a, b) => a.mechanic.localeCompare(b.mechanic))

  return {
    total: cases.length,
    passed: cases.filter((item) => item.passed).length,
    failed: cases.filter((item) => !item.passed).length,
    mechanics,
    cases,
    layers: {
      deterministic: { status: 'active', description: 'Exact Rulebook branches with forced inputs and explicit assertions.' },
      interaction: { status: 'active', description: 'Regression and boundary suites chain multiple mechanics together.' },
      interactive: { status: 'active', description: 'The selected Rulebook case is shown as a step-by-step interactive demo.' },
      rules_demo: { status: 'active', description: 'The same approved demo components are available in the Rules section.' },
      full_game: { status: 'conditional', description: 'Use complete games for integration discovery after targeted coverage passes.' },
      statistical: { status: 'planned', description: 'Large samples are reserved for frequency and balance questions, not rule proof.' },
    },
  }
}
