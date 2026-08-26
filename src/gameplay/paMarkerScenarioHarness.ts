import { beginPrePitchDecision, confirmManagerDecision, resolveDecisionRoll } from './decisionEngine'
import { resolveCoreResult } from './coreGame'
import type { GameSide, GameState, PendingDecision } from './types'
import type { ScenarioReport, ScenarioResult } from './scenarioHarness'

/**
 * Regression coverage for hitterPlateAppearanceCardKeys / pitcherAppearanceCardKeys
 * (coreGame.ts's markPlateAppearanceCompleted, called once from inside
 * finishPlateAppearance). Confirms every non-chart-result path that ends a
 * plate appearance -- intentional walk, sac bunt, squeeze bunt, an RTS
 * failure -- marks it correctly, not just the ordinary chart-result path.
 */

type TestFn = () => void
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }

const offense = (s: GameState): GameSide => (s.half === 'top' ? 'away' : 'home')
const defense = (s: GameState): GameSide => (offense(s) === 'away' ? 'home' : 'away')

function fixture(initial: GameState): GameState {
  const s = structuredClone(initial)
  s.status = 'in_progress'; s.waitingFor = 'PITCH_ROLL'; s.pendingDecision = null
  s.inning = 5; s.half = 'top'; s.outs = 0; s.score = { away: 0, home: 0 }
  s.bases = { first: null, second: null, third: null }
  s.naturalStolenBaseUsed = { away: false, home: false }
  s.hitterPlateAppearanceCardKeys = { away: [], home: [] }
  s.pitcherAppearanceCardKeys = { away: [], home: [] }
  const off = offense(s), def = defense(s)
  s.nextActor = def
  const batter = s.pregame[off].battingOrderCardKeys[0] ?? null
  const pitcher = s.pregame[def].defensiveAlignment.P ?? s.pregame[def].startingPitcherCardKey
  s.plateAppearance = { batterCardKey: batter, pitcherCardKey: pitcher, pitchRoll: null, pitchTotal: null, advantage: null, swingRoll: null, chartResult: null, infieldIn: false }
  return s
}

function pending(state: GameState, type: string, actingSide: GameSide, context: Record<string, unknown>): GameState {
  const d: PendingDecision = { id: `pa-marker-${type}`, ruleCondition: 'RC5_CONDITIONAL_GAME_STATE', decisionType: type, actingSide, legalActions: [], context, createdAt: '2026-01-01T00:00:00.000Z' }
  return { ...state, status: 'awaiting_decision', waitingFor: 'CONDITIONAL_DECISION', nextActor: actingSide, pendingDecision: d }
}

export function runPaMarkerScenarioMatrix(initial: GameState): ScenarioReport {
  const results: ScenarioResult[] = []
  const test = (id: string, category: string, description: string, fn: TestFn) => {
    try { fn(); results.push({ id, category, description, passed: true, detail: 'Expected marker state matched.' }) }
    catch (e) { results.push({ id, category, description, passed: false, detail: e instanceof Error ? e.message : String(e) }) }
  }

  test('PA-MARK-01', 'Baseline', 'A fresh at-bat has not marked its batter/pitcher as appeared yet', () => {
    const s = fixture(initial)
    const off = offense(s), def = defense(s)
    assert(!s.hitterPlateAppearanceCardKeys![off].includes(s.plateAppearance.batterCardKey!), 'Batter should not be pre-marked.')
    assert(!s.pitcherAppearanceCardKeys![def].includes(s.plateAppearance.pitcherCardKey!), 'Pitcher should not be pre-marked.')
  })

  test('PA-MARK-02', 'Chart-result path', 'A strikeout (ordinary chart result, no runners) marks both batter and pitcher', () => {
    const s = fixture(initial)
    const off = offense(s), def = defense(s)
    const batter = s.plateAppearance.batterCardKey!, pitcher = s.plateAppearance.pitcherCardKey!
    const n = resolveCoreResult(s, 'K')
    assert(n.hitterPlateAppearanceCardKeys![off].includes(batter), 'Chart-result strikeout did not mark the batter.')
    assert(n.pitcherAppearanceCardKeys![def].includes(pitcher), 'Chart-result strikeout did not mark the pitcher.')
  })

  test('PA-MARK-03', 'Intentional walk', 'An intentional walk marks both batter and pitcher (a walk is a real plate appearance)', () => {
    const s = fixture(initial)
    const off = offense(s), def = defense(s)
    const batter = s.plateAppearance.batterCardKey!, pitcher = s.plateAppearance.pitcherCardKey!
    const p = beginPrePitchDecision(s, 'INTENTIONAL_WALK')
    const n = confirmManagerDecision(p, ['CONFIRM_INTENTIONAL_WALK'])
    assert(n.hitterPlateAppearanceCardKeys![off].includes(batter), 'Intentional walk did not mark the batter -- this path bypasses PITCH_ROLLED/SWING_RESOLVED entirely, exactly the gap this marker exists to close.')
    assert(n.pitcherAppearanceCardKeys![def].includes(pitcher), 'Intentional walk did not mark the pitcher.')
  })

  test('PA-MARK-04', 'Sac bunt', 'A resolved no-wheel sac bunt (strikeout branch) marks both batter and pitcher', () => {
    const s = fixture(initial)
    const off = offense(s), def = defense(s)
    const batter = s.plateAppearance.batterCardKey!, pitcher = s.plateAppearance.pitcherCardKey!
    // Roll 3 = STRIKEOUT per noWheelSacBuntOutcome's own boundary table (see scenarioHarness.ts BUNT-NW-3).
    const n = resolveDecisionRoll(pending(s, 'SAC_BUNT_RTS', off, {}), 3)
    assert(n.hitterPlateAppearanceCardKeys![off].includes(batter), 'Sac bunt did not mark the batter.')
    assert(n.pitcherAppearanceCardKeys![def].includes(pitcher), 'Sac bunt did not mark the pitcher.')
  })

  test('PA-MARK-05', 'Squeeze bunt', 'A resolved squeeze bunt marks both batter and pitcher', () => {
    const s = fixture(initial)
    s.bases.third = { cardKey: 'R3', playerName: 'Runner 3', baserunning: 14, stolenBase: 12 }
    const off = offense(s), def = defense(s)
    const batter = s.plateAppearance.batterCardKey!, pitcher = s.plateAppearance.pitcherCardKey!
    // Roll 8 = lead runner out, batter safe -- resolves via advanceForcedOne, which
    // always calls finishPlateAppearance. (Roll 1-7 instead resumes the SAME plate
    // appearance rather than ending it, so it deliberately isn't used here.)
    const n = resolveDecisionRoll(pending(s, 'SQUEEZE_BUNT_ROLL', off, {}), 8)
    assert(n.hitterPlateAppearanceCardKeys![off].includes(batter), 'Squeeze bunt did not mark the batter.')
    assert(n.pitcherAppearanceCardKeys![def].includes(pitcher), 'Squeeze bunt did not mark the pitcher.')
  })

  test('PA-MARK-06', 'RTS failure', 'A failed extra-base RTS ends the PA via finishPlateAppearance and marks both batter and pitcher', () => {
    const s = fixture(initial)
    const off = offense(s), def = defense(s)
    const batter = s.plateAppearance.batterCardKey!, pitcher = s.plateAppearance.pitcherCardKey!
    const attempt = { runner: { cardKey: 'R2', playerName: 'Runner 2', baserunning: 14, stolenBase: 12 }, from: '2B' as const, to: 'HOME' as const }
    // Roll 10 fails the RTS (1-10 fails per the Rulebook boundary already covered in scenarioHarness.ts XB-02).
    const n = resolveDecisionRoll(pending(s, 'EXTRA_BASE_RTS', off, { attempts: [attempt], target: attempt }), 10)
    assert(!n.pendingDecision, 'RTS 10 should have ended the attempt (sanity check on the fixture, matches XB-02).')
    assert(n.hitterPlateAppearanceCardKeys![off].includes(batter), 'Failed RTS did not mark the batter.')
    assert(n.pitcherAppearanceCardKeys![def].includes(pitcher), 'Failed RTS did not mark the pitcher.')
  })

  test('PA-MARK-07', 'Side scoping', 'Marking never crosses sides -- the batter never lands in the defense side, the pitcher never lands in the offense side', () => {
    const s = fixture(initial)
    const off = offense(s), def = defense(s)
    const batter = s.plateAppearance.batterCardKey!, pitcher = s.plateAppearance.pitcherCardKey!
    const n = resolveCoreResult(s, 'K')
    assert(!n.hitterPlateAppearanceCardKeys![def].includes(batter), 'Batter incorrectly recorded on the defensive side.')
    assert(!n.pitcherAppearanceCardKeys![off].includes(pitcher), 'Pitcher incorrectly recorded on the offensive side.')
  })

  test('PA-MARK-08', 'De-duplication', 'The same batter completing two separate plate appearances is recorded only once', () => {
    let s = fixture(initial)
    const off = offense(s), def = defense(s)
    const batter = s.plateAppearance.batterCardKey!, pitcher = s.plateAppearance.pitcherCardKey!
    s = resolveCoreResult(s, 'K')
    // Force the same batter back up for a second PA (independent of real lineup-cursor advancement) to test de-dupe in isolation.
    s = { ...s, plateAppearance: { ...s.plateAppearance, batterCardKey: batter, pitcherCardKey: pitcher, chartResult: null } }
    const n = resolveCoreResult(s, 'K')
    const hitterCount = n.hitterPlateAppearanceCardKeys![off].filter((k) => k === batter).length
    const pitcherCount = n.pitcherAppearanceCardKeys![def].filter((k) => k === pitcher).length
    assert(hitterCount === 1, `Expected the batter recorded exactly once across two PAs, found ${hitterCount}.`)
    assert(pitcherCount === 1, `Expected the pitcher recorded exactly once across two PAs, found ${pitcherCount}.`)
  })

  test('PA-MARK-09', 'Not-yet-resolved decisions', 'Starting a substitution decision without confirming it does not mark a plate appearance', () => {
    const s = fixture(initial)
    const off = offense(s), def = defense(s)
    const batter = s.plateAppearance.batterCardKey!, pitcher = s.plateAppearance.pitcherCardKey!
    const n = beginPrePitchDecision(s, 'PITCHING_CHANGE')
    assert(!n.hitterPlateAppearanceCardKeys![off].includes(batter), 'An unconfirmed decision should not mark the batter as having appeared.')
    assert(!n.pitcherAppearanceCardKeys![def].includes(pitcher), 'An unconfirmed decision should not mark the pitcher as having appeared.')
  })

  const categories: ScenarioReport['categories'] = {}
  for (const r of results) { categories[r.category] ??= { total: 0, passed: 0 }; categories[r.category].total++; if (r.passed) categories[r.category].passed++ }
  return { total: results.length, passed: results.filter((r) => r.passed).length, failed: results.filter((r) => !r.passed).length, categories, results }
}
