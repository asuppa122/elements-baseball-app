import { beginPrePitchDecision, confirmManagerDecision, getDecisionView, getPrePitchActions, resolveDecisionRoll } from './decisionEngine'
import { resolveCoreResult, type CoreChartResult } from './coreGame'
import { effectivePitcherControl } from './fatigueEngine'
import { openPlay, startPlayLog } from './playLog'
import { describePlay } from './presentation/playRecord'
import { pitcherInstanceKey } from './pitcherStateKey'
import { changePitcher } from './pitcherMound'
import type { ScenarioReport, ScenarioResult } from './scenarioHarness'
import type { BasesState, GameSide, GameState, PlayRecord } from './types'

/**
 * Rules v2 (Anthony's decisions of 2026-11-01): one deterministic scenario per
 * branch, each built from an exact state with forced rolls. Every defect fixed
 * in v2 (D1, D2, D3, D7, D8, D9, D10, F) keeps its scenario here permanently;
 * the v1 scenarios elsewhere keep proving that games created before v2 still
 * play exactly as they did.
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const offense = (s: GameState): GameSide => (s.half === 'top' ? 'away' : 'home')
const defense = (s: GameState): GameSide => (offense(s) === 'away' ? 'home' : 'away')

type Base = 'first' | 'second' | 'third'

/** A v2 game at a chosen point: inning, half, outs, score, runners (by batting-order index). */
function v2(initial: GameState, setup: { inning?: number; half?: 'top' | 'bottom'; outs?: 0 | 1 | 2; score?: { away: number; home: number }; runners?: Partial<Record<Base, number>>; batterIndex?: number } = {}): GameState {
  let s = structuredClone(initial)
  s.rulesVersion = 2
  s.status = 'in_progress'
  s.waitingFor = 'PITCH_ROLL'
  s.pendingDecision = null
  s.inning = setup.inning ?? 5
  s.half = setup.half ?? 'top'
  s.outs = setup.outs ?? 0
  s.score = setup.score ?? { away: 0, home: 0 }
  s.naturalStolenBaseUsed = { away: false, home: false }
  const off = offense(s), def = defense(s)
  s.nextActor = def
  const order = s.pregame[off].battingOrderCardKeys
  const batterIndex = setup.batterIndex ?? 0
  s.lineupCursor = { ...s.lineupCursor, [off]: batterIndex }
  const pitcher = s.pregame[def].defensiveAlignment.P ?? null
  s.plateAppearance = { batterCardKey: order[batterIndex], pitcherCardKey: pitcher, pitchRoll: null, pitchTotal: null, advantage: 'hitter', swingRoll: null, chartResult: null, infieldIn: false }
  const bases: BasesState = { first: null, second: null, third: null }
  for (const [base, index] of Object.entries(setup.runners ?? {}) as Array<[Base, number]>) {
    const card = s.pregame[off].roster!.cards[order[index]]
    bases[base] = { cardKey: card.cardKey, playerName: card.playerName, baserunning: card.hitter.baserunning, stolenBase: card.hitter.stolenBase, responsiblePitcherKey: pitcher ?? undefined }
  }
  s.bases = bases
  s = startPlayLog(s)
  return s
}

const lastPlay = (s: GameState): PlayRecord => {
  const play = s.playLog?.plays.at(-1)
  assert(play, 'Expected a recorded play.')
  return play
}
const keyAt = (s: GameState, base: Base) => s.bases[base]?.cardKey ?? null
const order = (s: GameState, side: GameSide) => s.pregame[side].battingOrderCardKeys
// The pitch roll opens the play in a real game; a fixture that goes straight to the chart does the same.
const swing = (s: GameState, result: CoreChartResult) => resolveCoreResult(openPlay(s), result)
const confirm = (s: GameState, id: string) => confirmManagerDecision(s, [id])
const roll = (s: GameState, value: number) => resolveDecisionRoll(s, value)
const optionIds = (s: GameState) => getDecisionView(s)?.options.map((o) => o.id) ?? []
const preActions = (s: GameState) => getPrePitchActions(s).map((a) => a.id)

function runnerKeyOf(s: GameState, index: number): string {
  return order(s, offense(s))[index]
}

export function runRulesV2ScenarioMatrix(initial: GameState): ScenarioReport {
  const results: ScenarioResult[] = []
  const test = (id: string, category: string, description: string, fn: () => void) => {
    try {
      fn()
      results.push({ id, category, description, passed: true, detail: 'Passed' })
    } catch (error) {
      results.push({ id, category, description, passed: false, detail: error instanceof Error ? error.message : String(error) })
    }
  }

  // ---------------------------------------------------------------- walks
  const WALK_CASES: Array<{ id: string; runners: Partial<Record<Base, number>>; after: [number | 'B' | null, number | 'B' | null, number | 'B' | null]; runs: number }> = [
    { id: 'EMPTY', runners: {}, after: ['B', null, null], runs: 0 },
    { id: '1B', runners: { first: 1 }, after: ['B', 1, null], runs: 0 },
    { id: '2B', runners: { second: 2 }, after: ['B', 2, null], runs: 0 },
    { id: '3B', runners: { third: 3 }, after: ['B', null, 3], runs: 0 },
    { id: '1B2B', runners: { first: 1, second: 2 }, after: ['B', 1, 2], runs: 0 },
    { id: '1B3B', runners: { first: 1, third: 3 }, after: ['B', 1, 3], runs: 0 },
    { id: '2B3B', runners: { second: 2, third: 3 }, after: ['B', 2, 3], runs: 0 },
    { id: 'LOADED', runners: { first: 1, second: 2, third: 3 }, after: ['B', 1, 2], runs: 1 },
  ]
  const checkWalk = (s: GameState, c: (typeof WALK_CASES)[number], before: GameState) => {
    const expectKey = (v: number | 'B' | null) => (v === null ? null : v === 'B' ? runnerKeyOf(before, 0) : runnerKeyOf(before, v))
    assert(keyAt(s, 'first') === expectKey(c.after[0]) && keyAt(s, 'second') === expectKey(c.after[1]) && keyAt(s, 'third') === expectKey(c.after[2]), `Bases after the walk: ${JSON.stringify(s.bases)}`)
    assert(s.score.away === c.runs, `Expected ${c.runs} run(s), got ${s.score.away}.`)
    assert(lastPlay(s).batting?.rbi === c.runs, `RBI should be ${c.runs}.`)
  }
  for (const c of WALK_CASES) {
    test(`V2-WALK-${c.id}`, 'Walks', `Chart walk, ${c.id}: batter to 1B, only forced runners advance`, () => {
      const before = v2(initial, { runners: c.runners })
      const after = swing(before, 'BB')
      checkWalk(after, c, before)
      assert(lastPlay(after).batting?.credit === 'walk', 'Credit should be a walk.')
    })
    test(`V2-IBB-${c.id}`, 'Walks', `Intentional walk, ${c.id}: identical movement, credited as an intentional walk`, () => {
      const before = v2(initial, { runners: c.runners })
      const after = confirm(beginPrePitchDecision(before, 'INTENTIONAL_WALK'), 'CONFIRM_INTENTIONAL_WALK')
      checkWalk(after, c, before)
      assert(lastPlay(after).batting?.credit === 'intentional_walk', 'Credit should be an intentional walk.')
    })
  }
  test('V2-WALK-WALKOFF', 'Walk-offs', 'Bases-loaded walk in a tied bottom 9th ends the game 1 run up, RBI 1', () => {
    const s = swing(v2(initial, { inning: 9, half: 'bottom', score: { away: 3, home: 3 }, runners: { first: 1, second: 2, third: 3 } }), 'BB')
    assert(s.status === 'complete', 'Game should be over.')
    assert(s.score.home === 4 && s.score.away === 3, `Final should be 4-3, got ${s.score.home}-${s.score.away}.`)
    assert(lastPlay(s).batting?.rbi === 1, 'RBI 1.')
  })

  // ---------------------------------------------------------------- walk-offs (D7, D2)
  test('V2-WO-DOUBLE-AS-SINGLE', 'Walk-offs', 'Tied 4-4, R2 + R3, chart 2B: 5-4, credited as a single, one run uncounted', () => {
    const s = swing(v2(initial, { inning: 9, half: 'bottom', score: { away: 4, home: 4 }, runners: { second: 2, third: 3 } }), '2B')
    const play = lastPlay(s)
    assert(s.status === 'complete', 'Game should be over.')
    assert(s.score.home === 5, `Home should have 5, got ${s.score.home}.`)
    assert(play.batting?.credit === 'single' && play.batting.creditedFromChart === 'double', `Credit ${play.batting?.credit}.`)
    assert(play.batting?.rbi === 1, 'RBI 1.')
    assert(play.runs.filter((r) => r.counted).length === 1 && play.runs.filter((r) => !r.counted).length === 1, 'One counted, one uncounted run.')
    assert(play.winningRun?.from === 'third', 'Winning run from third.')
  })
  test('V2-WO-TRIPLE-AS-DOUBLE', 'Walk-offs', 'Trailing 4-3, bases loaded, chart 3B: 5-4, credited as a double, RBI 2', () => {
    const s = swing(v2(initial, { inning: 9, half: 'bottom', score: { away: 4, home: 3 }, runners: { first: 1, second: 2, third: 3 } }), '3B')
    const play = lastPlay(s)
    assert(s.status === 'complete' && s.score.home === 5, `Final ${s.score.home}-${s.score.away}.`)
    assert(play.batting?.credit === 'double' && play.batting.rbi === 2, `Credit ${play.batting?.credit} RBI ${play.batting?.rbi}.`)
  })
  test('V2-WO-DOUBLE-FULL', 'Walk-offs', 'Tied, R2 only, chart 2B: the winning runner advanced 2, so a full double', () => {
    const s = swing(v2(initial, { inning: 9, half: 'bottom', score: { away: 3, home: 3 }, runners: { second: 2 } }), '2B')
    assert(s.status === 'complete' && lastPlay(s).batting?.credit === 'double' && !lastPlay(s).batting?.creditedFromChart, 'Full double.')
  })
  test('V2-WO-HR', 'Walk-offs', 'Trailing 4-3, R1 + R2, HR: every run counts (every Elements HR leaves the park), RBI 3', () => {
    const s = swing(v2(initial, { inning: 9, half: 'bottom', score: { away: 4, home: 3 }, runners: { first: 1, second: 2 } }), 'HR')
    assert(s.status === 'complete' && s.score.home === 6, `Home should have 6, got ${s.score.home}.`)
    assert(lastPlay(s).batting?.credit === 'home_run' && lastPlay(s).batting?.rbi === 3, 'HR, RBI 3.')
  })
  test('V2-WO-NO-EXTRA-BASE', 'Walk-offs', 'Tied, R1 + R3, single: game over at once -- no extra-base decision, no further play', () => {
    const s = swing(v2(initial, { inning: 9, half: 'bottom', score: { away: 2, home: 2 }, runners: { first: 1, third: 3 } }), '1B')
    assert(s.status === 'complete' && s.pendingDecision === null, `Expected a finished game, got ${s.status} / ${s.pendingDecision?.decisionType}.`)
    assert(s.score.home === 3, 'One run.')
  })
  test('V2-WO-1BPLUS-NO-STEAL', 'Walk-offs', 'Tied, R3, 1B+: game over -- the mandatory 1B+ steal does not happen', () => {
    const s = swing(v2(initial, { inning: 10, half: 'bottom', score: { away: 2, home: 2 }, runners: { third: 3 } }), '1B+')
    assert(s.status === 'complete' && s.pendingDecision === null, 'No 1B+ steal decision after the winning run.')
  })
  test('V2-WO-TOP-UNCHANGED', 'Walk-offs', 'Top of the 9th: a visitors double with R2 + R3 scores both runs, no walk-off logic', () => {
    const s = swing(v2(initial, { inning: 9, half: 'top', score: { away: 4, home: 4 }, runners: { second: 2, third: 3 } }), '2B')
    assert(s.score.away === 6 && s.status !== 'complete', `Visitors should have 6, got ${s.score.away}.`)
  })
  test('V2-WO-STEAL-HOME', 'Walk-offs', 'D2: tied bottom 9th, steal of home succeeds -- game over, no PA, order unchanged', () => {
    const before = v2(initial, { inning: 9, half: 'bottom', outs: 1, score: { away: 3, home: 3 }, runners: { third: 3 }, batterIndex: 4 })
    let s = beginPrePitchDecision(before, 'NATURAL_STEAL')
    s = confirmManagerDecision(s, [optionIds(s)[0]])
    s = roll(s, 1)
    assert(s.status === 'complete', `Game should be over, got ${s.status}.`)
    assert(s.lineupCursor.home === 4, 'The batting order must not advance.')
    assert(!(s.hitterPlateAppearanceCardKeys?.home ?? []).includes(order(before, 'home')[4]), 'No plate appearance for the batter.')
    const play = lastPlay(s)
    assert(play.kind === 'baserunning' && play.steals[0]?.success === true, 'A baserunning play with a stolen base.')
  })
  test('V2-WO-SAC-FLY-THROW', 'Walk-offs', 'Tied, R2 + R3, FB: the run scores on the tag before the throw at the trailing runner; game over', () => {
    let s = swing(v2(initial, { inning: 9, half: 'bottom', score: { away: 1, home: 1 }, runners: { second: 2, third: 3 } }), 'FB')
    s = confirm(s, 'ATTEMPT_TAG_UP')
    s = confirmManagerDecision(s, optionIds(s))
    s = roll(s, 20)
    const target = optionIds(s).find((id) => id.includes('2B->3B'))
    assert(target, 'Defense should be able to throw at the trailing runner.')
    s = confirm(s, target)
    s = roll(s, 20)
    assert(s.status === 'complete' && s.score.home === 2, `Final ${s.score.home}-${s.score.away}.`)
    assert(s.outs === 1, 'The throw after the winning run never happened.')
    assert(lastPlay(s).batting?.credit === 'sacrifice_fly' && lastPlay(s).outfieldAssists.length === 0, 'SF, no assist.')
  })

  // ---------------------------------------------------------------- squeeze (D1, D8) and the action lock (Decision 5)
  test('V2-D1-SQUEEZE-THIRD-OUT', 'Squeeze', 'D1: squeeze 1-7 for the third out ends the inning with no PA; the same batter leads off next', () => {
    const before = v2(initial, { outs: 2, runners: { third: 3 }, batterIndex: 5 })
    let s = confirm(beginPrePitchDecision(before, 'SQUEEZE_BUNT'), 'CONFIRM_SQUEEZE')
    s = roll(s, 4)
    assert(s.half === 'bottom' && s.outs === 0, 'Inning should be over.')
    assert(s.lineupCursor.away === 5, `Order must not advance (cursor ${s.lineupCursor.away}).`)
    const play = lastPlay(s)
    assert(play.kind === 'baserunning' && play.steals[0]?.success === false && play.steals[0]?.kind === 'squeeze', 'Recorded as a caught stealing.')
  })
  test('V2-D1-SQUEEZE-LOCK', 'Squeeze', 'Squeeze 1-7 with fewer than two out: the PA continues and every manager action is locked', () => {
    let s = confirm(beginPrePitchDecision(v2(initial, { outs: 0, runners: { first: 1, third: 3 } }), 'SQUEEZE_BUNT'), 'CONFIRM_SQUEEZE')
    s = roll(s, 2)
    assert(s.waitingFor === 'PITCH_ROLL' && s.outs === 1, 'Same PA, one out.')
    assert(preActions(s).length === 0, `No manager action may follow: ${preActions(s).join(', ')}`)
  })
  test('V2-D8-SQUEEZE-TWO-OUT', 'Squeeze', 'D8: squeeze 16-19 with two out -- the batter-runner is the third out, the run does not count', () => {
    let s = confirm(beginPrePitchDecision(v2(initial, { outs: 2, runners: { third: 3 } }), 'SQUEEZE_BUNT'), 'CONFIRM_SQUEEZE')
    s = roll(s, 17)
    assert(s.score.away === 0 && s.half === 'bottom', `No run, inning over (score ${s.score.away}).`)
  })
  test('V2-D8-SQUEEZE-ONE-OUT', 'Squeeze', 'Squeeze 16-19 with one out: the run scores, sacrifice bunt, RBI 1', () => {
    let s = confirm(beginPrePitchDecision(v2(initial, { outs: 1, runners: { third: 3 } }), 'SQUEEZE_BUNT'), 'CONFIRM_SQUEEZE')
    s = roll(s, 17)
    assert(s.score.away === 1 && s.outs === 2, 'Run in, two out.')
    assert(lastPlay(s).batting?.credit === 'sacrifice_bunt' && lastPlay(s).batting?.rbi === 1, 'SH, RBI 1.')
  })
  const stealOnce = (s: GameState, catcherRoll: number) => {
    let next = beginPrePitchDecision(s, 'NATURAL_STEAL')
    next = confirmManagerDecision(next, [optionIds(next)[0]])
    return roll(next, catcherRoll)
  }
  test('V2-LOCK-STEAL-SAFE', 'Action lock', 'After a successful steal no manager action is offered for the rest of the PA', () => {
    const s = stealOnce(v2(initial, { runners: { first: 1 } }), 1)
    assert(keyAt(s, 'second') !== null && preActions(s).length === 0, `Locked: ${preActions(s).join(', ')}`)
  })
  test('V2-LOCK-STEAL-CAUGHT', 'Action lock', 'After a caught stealing (not the third out) no manager action is offered', () => {
    const s = stealOnce(v2(initial, { runners: { first: 1 } }), 20)
    assert(s.outs === 1 && preActions(s).length === 0, 'Locked after CS.')
  })
  test('V2-LOCK-RESET-NEW-INNING', 'Action lock', 'A caught stealing for the third out: inning over, the lock resets for the new half', () => {
    const s = stealOnce(v2(initial, { outs: 2, runners: { first: 1 } }), 20)
    assert(s.half === 'bottom' && !s.plateAppearance.actionsLocked && preActions(s).includes('INTENTIONAL_WALK'), 'Unlocked in the new half.')
  })
  test('V2-LOCK-HANDSHAKE', 'Action lock', 'Two-player games: with nothing left to call, the offence is not asked to declare ready', () => {
    const before = { ...v2(initial, { runners: { first: 1 } }), turnHandshake: true }
    const s = stealOnce({ ...before, plateAppearance: { ...before.plateAppearance, offenseReady: false } }, 1)
    assert(s.plateAppearance.offenseReady === true, 'Offence should not be waited on.')
  })
  test('V2-LOCK-UNLOCKED-BEFORE', 'Action lock', 'Before any steal, intentional walk, pinch hitter and pitching change are offered', () => {
    const ids = preActions(v2(initial, { runners: { first: 1 } }))
    assert(ids.includes('INTENTIONAL_WALK') && ids.includes('PINCH_HITTER') && ids.includes('PITCHING_CHANGE'), ids.join(', '))
  })

  // ---------------------------------------------------------------- Infield In (Decisions 2-4)
  // Offered only with a runner on 3B and fewer than two out (Anthony,
  // 2026-11-01, replacing Decision 2's runner-on-any-base availability).
  const II_AVAILABLE: Array<[string, Partial<Record<Base, number>>]> = [['3B', { third: 3 }], ['1B3B', { first: 1, third: 3 }], ['2B3B', { second: 2, third: 3 }], ['LOADED', { first: 1, second: 2, third: 3 }]]
  for (const [id, runners] of II_AVAILABLE) {
    test(`V2-II-AVAIL-${id}`, 'Infield In', `Infield In offered with runners ${id} and fewer than two out; not with two out`, () => {
      assert(preActions(v2(initial, { runners, outs: 1 })).includes('INFIELD_IN'), 'Should be offered.')
      assert(!preActions(v2(initial, { runners, outs: 2 })).includes('INFIELD_IN'), 'Not with two out.')
    })
  }
  const II_UNAVAILABLE: Array<[string, Partial<Record<Base, number>>]> = [['EMPTY', {}], ['1B', { first: 1 }], ['2B', { second: 2 }], ['1B2B', { first: 1, second: 2 }]]
  for (const [id, runners] of II_UNAVAILABLE) {
    test(`V2-II-UNAVAIL-${id}`, 'Infield In', `Infield In is not offered with runners ${id} (no runner on 3B)`, () => {
      assert(!preActions(v2(initial, { runners, outs: 0 })).includes('INFIELD_IN'), 'Not without a runner on third.')
    })
  }
  const infieldIn = (s: GameState) => confirm(beginPrePitchDecision(s, 'INFIELD_IN'), 'CONFIRM_INFIELD_IN')
  const gbInfieldIn = (runners: Partial<Record<Base, number>>, outs: 0 | 1 = 0) => {
    const before = v2(initial, { runners, outs })
    return { before, after: swing(infieldIn(before), 'GB') }
  }
  // Infield In needs a runner on 3B, so the Rulebook's 1B-only, 2B-only and
  // 1B + 2B outcomes cannot arise from a declaration and are not tested here.
  test('V2-II-GB-1B3B-HOLD', 'Infield In', 'R1 + R3, hold (Anthony, 2026-11-01): batter safe at 1B, R1 forced to 2B, R3 holds, no out, no run -- bases loaded', () => {
    const { before, after } = gbInfieldIn({ first: 1, third: 3 }, 1)
    const s = confirm(after, 'HOLD_RUNNERS')
    assert(keyAt(s, 'first') === runnerKeyOf(before, 0) && keyAt(s, 'second') === runnerKeyOf(before, 1) && keyAt(s, 'third') === runnerKeyOf(before, 3), `Bases ${JSON.stringify(s.bases)}.`)
    assert(s.outs === 1 && s.score.away === 0, `No out added (outs ${s.outs}), no run.`)
    const play = lastPlay(s)
    assert(play.batting?.credit === 'fielders_choice' && play.batting.rbi === 0 && play.outsAfter === play.outsBefore, `Credit ${play.batting?.credit}.`)
  })
  test('V2-II-GB-1B3B-CONTACT', 'Infield In', 'R1 + R3: contact play is still the offence\'s alternative (roll 20: R3 out at home, R1 to 2B, batter safe)', () => {
    const { before, after } = gbInfieldIn({ first: 1, third: 3 })
    assert(optionIds(after).includes('CONTACT_PLAY'), 'Contact play offered.')
    const s = roll(confirm(after, 'CONTACT_PLAY'), 20)
    assert(s.outs === 1 && keyAt(s, 'second') === runnerKeyOf(before, 1) && keyAt(s, 'first') === runnerKeyOf(before, 0) && !keyAt(s, 'third'), `Bases ${JSON.stringify(s.bases)}.`)
  })
  test('V2-II-GB-LOADED', 'Infield In', 'Bases loaded, GB: runner from 3B out at home, bases still loaded, no run', () => {
    const { before, after } = gbInfieldIn({ first: 1, second: 2, third: 3 })
    const s = confirm(after, 'HOLD_RUNNERS')
    assert(s.score.away === 0 && s.outs === 1 && keyAt(s, 'third') === runnerKeyOf(before, 2) && keyAt(s, 'first') === runnerKeyOf(before, 0), `Bases ${JSON.stringify(s.bases)}.`)
  })
  test('V2-II-PU-SINGLE', 'Infield In', 'R3, Infield In, PU: becomes a single, runners +1 (R3 scores), credited as a hit', () => {
    const before = v2(initial, { runners: { third: 3 } })
    const s = swing(infieldIn(before), 'PU')
    assert(keyAt(s, 'first') === runnerKeyOf(before, 0) && !keyAt(s, 'third') && s.score.away === 1 && s.outs === 0, `Single: bases ${JSON.stringify(s.bases)}, score ${s.score.away}.`)
    assert(lastPlay(s).batting?.credit === 'single', 'Credited as a single.')
  })
  test('V2-II-TWO-OUT-AT-SWING', 'Infield In', 'Decision 3: Infield In declared, then two out by the swing -- a PU is an out', () => {
    const declared = infieldIn(v2(initial, { runners: { first: 1, third: 3 }, outs: 1 }))
    const s = swing({ ...declared, outs: 2 }, 'PU')
    assert(s.half === 'bottom', 'PU was the third out.')
  })
  test('V2-II-EMPTY-AT-SWING', 'Infield In', 'Decision 3: Infield In declared, then the bases emptied -- a FB is an out', () => {
    const declared = infieldIn(v2(initial, { runners: { third: 3 }, outs: 0 }))
    const s = swing({ ...declared, bases: { first: null, second: null, third: null } }, 'FB')
    assert(s.outs === 1 && !keyAt(s, 'first') && s.score.away === 0, 'FB is an out.')
  })

  // ---------------------------------------------------------------- extra bases: roll to send first (Anthony, 2026-11-01)
  // Hit -> the offence sends -> the offence rolls to send -> on 11-20 the
  // defence picks runner and outfielder in one step -> the throw; on 1-10
  // nobody takes an extra base. Two out with a runner sent home: no roll.
  const offenceOf = (st: GameState): GameSide => (st.half === 'top' ? 'away' : 'home')
  const sendAll = (st: GameState) => confirmManagerDecision(confirm(st, 'ATTEMPT_EXTRA_BASES'), optionIds(confirm(st, 'ATTEMPT_EXTRA_BASES')))
  const sendLead = (st: GameState) => { const sel = confirm(st, 'ATTEMPT_EXTRA_BASES'); return confirmManagerDecision(sel, [optionIds(sel)[0]]) }
  test('V2-XB-RTS-FIRST', 'Extra bases', 'R2, single, send: the offence rolls to send first; on a pass the defence picks runner + outfielder, then the throw', () => {
    const before = v2(initial, { runners: { second: 2 } })
    const sent = sendLead(swing(before, '1B'))
    assert(sent.pendingDecision?.decisionType === 'EXTRA_BASE_RTS' && sent.pendingDecision.actingSide === offenceOf(before), `First step: ${sent.pendingDecision?.decisionType} by ${sent.pendingDecision?.actingSide}.`)
    const passed = roll(sent, 15)
    assert(passed.pendingDecision?.decisionType === 'EXTRA_BASE_THROW_SELECTION' && passed.pendingDecision.actingSide !== offenceOf(before), `After a pass: ${passed.pendingDecision?.decisionType}.`)
    assert(optionIds(passed).every((id) => id.includes('@@')) && optionIds(passed).length >= 1, 'Runner and outfielder are chosen together.')
    assert(describePlay(sent, passed).summary === 'Roll to send passes — the runners go, and the defence picks its throw', `Announced: ${describePlay(sent, passed).summary}.`)
    const thrown = confirm(passed, optionIds(passed)[0])
    assert(thrown.pendingDecision?.decisionType === 'OUTFIELD_FIELDING_ROLL', `Then the throw: ${thrown.pendingDecision?.decisionType}.`)
    const safe = roll(thrown, 1)
    assert(safe.score.away + safe.score.home === 1 && !safe.pendingDecision, 'Natural 1: the runner scores.')
  })
  test('V2-XB-RTS-FAIL', 'Extra bases', 'Roll to send 1-10: nobody takes an extra base and the play is over', () => {
    const before = v2(initial, { runners: { second: 2 } })
    const s = roll(sendLead(swing(before, '1B')), 5)
    assert(!s.pendingDecision && keyAt(s, 'third') === runnerKeyOf(before, 2) && s.score.away + s.score.home === 0, `Bases ${JSON.stringify(s.bases)}.`)
  })
  test('V2-XB-TWO-OUT-HOME', 'Extra bases', 'Two out with a runner sent home: no roll to send -- straight to the defence\'s runner + outfielder pick', () => {
    const before = v2(initial, { runners: { second: 2 }, outs: 2 })
    const s = sendLead(swing(before, '1B'))
    assert(s.pendingDecision?.decisionType === 'EXTRA_BASE_THROW_SELECTION' && s.pendingDecision.context.rtsSkipped === true, `Got ${s.pendingDecision?.decisionType}.`)
  })
  test('V2-XB-MULTI-RTS-FIRST', 'Extra bases', 'R1 + R2, single, both sent: the roll to send still comes before the defence picks its runner', () => {
    const before = v2(initial, { runners: { first: 1, second: 2 } })
    const s = sendAll(swing(before, '1B'))
    assert(s.pendingDecision?.decisionType === 'EXTRA_BASE_RTS', `Got ${s.pendingDecision?.decisionType}.`)
    const passed = roll(s, 15)
    assert(new Set(optionIds(passed).map((id) => id.split('@@')[0])).size === 2, 'Both runners can be thrown at.')
  })

  // ---------------------------------------------------------------- ground balls, GIDP, defensive attempts (D3, Decisions 7 and 11)
  test('V2-GB-DP-GIDP', 'Ground balls', 'Standard DP, roll 20: two outs, GIDP, no RBI though R3 scores, DBPa recorded', () => {
    let s = swing(v2(initial, { runners: { first: 1, third: 3 } }), 'GB')
    s = confirm(s, 'ATTEMPT_STANDARD_DBP')
    s = confirm(s, optionIds(s)[0])
    s = roll(s, 20)
    const play = lastPlay(s)
    assert(s.outs === 2 && s.score.away === 1, `Two out, run in (outs ${s.outs}, runs ${s.score.away}).`)
    assert(play.batting?.gidp === true && play.batting.rbi === 0, 'GIDP, no RBI.')
    assert(play.defense[0]?.kind === 'double_play' && play.defense[0].outsOnPlay === 2 && play.defense[0].fielderKeys.length === 3, 'Double-play attempt with three fielders.')
  })
  test('V2-GB-DP-ALL-SAFE', 'Ground balls', 'Standard DP, roll 1: all safe, fielder\'s choice, RBI for the run from 3B, attempt with no outs', () => {
    let s = swing(v2(initial, { runners: { first: 1, third: 3 } }), 'GB')
    s = confirm(s, 'ATTEMPT_STANDARD_DBP')
    s = confirm(s, optionIds(s)[0])
    s = roll(s, 1)
    const play = lastPlay(s)
    assert(play.batting?.credit === 'fielders_choice' && play.batting.rbi === 1 && !play.batting.gidp, 'FC, RBI 1.')
    assert(play.defense[0]?.outsOnPlay === 0, 'Attempt recorded, no outs.')
  })
  const withTriplePlayFielders = (s: GameState): GameState => {
    const def = defense(s)
    const roster = s.pregame[def].roster!
    const second = s.pregame[def].defensiveAlignment['2B']!
    const third = s.pregame[def].defensiveAlignment['3B']!
    const cards = { ...roster.cards, [second]: { ...roster.cards[second], defense: { ...roster.cards[second].defense, '2B': 4 } }, [third]: { ...roster.cards[third], defense: { ...roster.cards[third].defense, '3B': 2 } } }
    return { ...s, pregame: { ...s.pregame, [def]: { ...s.pregame[def], roster: { ...roster, cards } } } }
  }
  test('V2-GB-TP-TWO-OUTS', 'Ground balls', 'Triple-play attempt, two outs: GIDP, triple-play attempt with two outs (TBPa, no TBP)', () => {
    let s = swing(withTriplePlayFielders(v2(initial, { runners: { first: 1, second: 2 } })), 'GB')
    s = confirm(s, 'ATTEMPT_TRIPLE_PLAY')
    s = roll(s, 19)
    s = roll(s, 19)
    s = roll(s, 1)
    const play = lastPlay(s)
    assert(s.outs === 2 && keyAt(s, 'first') !== null, `Two out, batter safe (outs ${s.outs}).`)
    assert(play.defense[0]?.kind === 'triple_play' && play.defense[0].outsOnPlay === 2 && play.batting?.gidp === true, 'TP attempt, two outs, GIDP.')
  })
  test('V2-GB-TP-THREE-OUTS', 'Ground balls', 'Triple play completed: no GIDP', () => {
    let s = swing(withTriplePlayFielders(v2(initial, { runners: { first: 1, second: 2 } })), 'GB')
    s = confirm(s, 'ATTEMPT_TRIPLE_PLAY')
    s = roll(s, 20)
    const play = lastPlay(s)
    assert(play.defense[0]?.outsOnPlay === 3 && play.batting?.gidp === false, 'Three outs, no GIDP.')
  })
  test('V2-GB-NO-PHANTOM-OUTS', 'Ground balls', 'D3 invariant: every out on every GB branch is a retired runner or the batter', () => {
    const states: Array<Partial<Record<Base, number>>> = [{ first: 1 }, { first: 1, second: 2 }, { first: 1, third: 3 }, { first: 1, second: 2, third: 3 }]
    for (const runners of states) {
      for (const r of [1, 3, 8, 12, 17, 20]) {
        let s = swing(v2(initial, { runners }), 'GB')
        s = confirm(s, 'TAKE_SINGULAR_OUT')
        const before = v2(initial, { runners })
        s = roll(s, r)
        const runnersBefore = Object.values(before.bases).filter(Boolean).length + 1
        const runnersAfter = Object.values(s.bases).filter(Boolean).length
        assert(runnersAfter + s.score.away + s.outs === runnersBefore, `RFO ${r} with ${JSON.stringify(runners)}: ${runnersAfter} on + ${s.score.away} scored + ${s.outs} out != ${runnersBefore}.`)
      }
    }
  })

  // ---------------------------------------------------------------- responsibility and fatigue (F, Option B, D10)
  const relieve = (s: GameState): GameState => {
    const def = defense(s)
    const bench = Object.keys(s.pregame[def].roster!.cards).find((k) => !s.pregame[def].battingOrderCardKeys.includes(k) && k !== s.pregame[def].defensiveAlignment.P)!
    const old = s.pregame[def].defensiveAlignment.P!
    const moved = { ...s, pregame: { ...s.pregame, [def]: { ...s.pregame[def], defensiveAlignment: { ...s.pregame[def].defensiveAlignment, P: bench } } } }
    return changePitcher(moved, def, old, bench)
  }
  test('V2-RESP-INHERITED', 'Responsibility', 'A reliever allows a hit that scores an inherited runner: charged to the starter, inherited run for the reliever', () => {
    const before = v2(initial, { runners: { second: 2 } })
    const starter = before.pregame.home.defensiveAlignment.P!
    const relieved = relieve(before)
    const reliever = relieved.pregame.home.defensiveAlignment.P!
    const s = swing(relieved, '2B')
    assert(s.pitcherRunsAllowed?.[pitcherInstanceKey('home', starter)] === 1, 'Starter charged.')
    assert((s.pitcherRunsAllowed?.[pitcherInstanceKey('home', reliever)] ?? 0) === 0, 'Reliever not charged.')
    assert(s.pitcherInheritedRunsScored?.[pitcherInstanceKey('home', reliever)] === 1, 'Inherited run on the reliever.')
    assert(s.bases.second?.responsiblePitcherKey === reliever, 'The batter is the reliever\'s runner.')
  })
  test('V2-RESP-FIELDERS-CHOICE', 'Responsibility', 'OBR 9.16(g): a batter safe on a fielder\'s choice that retires the starter\'s runner takes the starter\'s responsibility', () => {
    const before = v2(initial, { runners: { first: 1 } })
    const starter = before.pregame.home.defensiveAlignment.P!
    let s = swing(relieve(before), 'GB')
    s = roll(confirm(s, 'TAKE_SINGULAR_OUT'), 10)
    assert(s.bases.first?.cardKey === runnerKeyOf(before, 0) && s.bases.first.responsiblePitcherKey === starter, 'Batter carries the starter.')
  })
  test('V2-RESP-PINCH-RUNNER', 'Responsibility', 'A pinch runner inherits the replaced runner\'s responsible pitcher', () => {
    const before = v2(initial, { runners: { first: 1 } })
    const starter = before.pregame.home.defensiveAlignment.P!
    let s = relieve(before)
    s = beginPrePitchDecision(s, 'PINCH_RUNNER')
    s = confirm(s, 'first')
    s = confirm(s, optionIds(s)[0])
    s = confirm(s, 'CARD_ATTRIBUTES')
    assert(s.bases.first?.responsiblePitcherKey === starter && s.bases.first.cardKey !== runnerKeyOf(before, 1), 'Pinch runner carries the starter.')
  })
  const fatigue = (input: Partial<Parameters<typeof effectivePitcherControl>[0]>) => effectivePitcherControl({ printedControl: 6, cardIp: 5, outsRecorded: 0, earnedRunsAllowed: 0, rulesVersion: 2, ...input })
  test('V2-FAT-THRESHOLD', 'Fatigue', 'Decision 4: first -2 on the out completing card IP (3, 5, 6, 7 IP -> outs 9, 15, 18, 21)', () => {
    for (const [ip, out] of [[3, 9], [5, 15], [6, 18], [7, 21]] as const) {
      assert(fatigue({ cardIp: ip, outsRecorded: out - 1, earnedRunsAllowed: 1 }) === 6, `${ip} IP: no penalty before out ${out}.`)
      assert(fatigue({ cardIp: ip, outsRecorded: out, earnedRunsAllowed: 1 }) === 4, `${ip} IP: -2 at out ${out}.`)
    }
  })
  test('V2-FAT-D10-SHORT-IP', 'Fatigue', 'D10: card IP 3, Control -5 at out 14 stays -5 when the Shutout Bonus starts at out 15', () => {
    assert(fatigue({ cardIp: 3, outsRecorded: 14 }) === -5 && fatigue({ cardIp: 3, outsRecorded: 15 }) === -5 && fatigue({ cardIp: 3, outsRecorded: 18 }) === -5, 'No Control restored.')
  })
  test('V2-FAT-D10-CARD-IP-4', 'Fatigue', 'D10: card IP 4, Control 0 at out 14 -- the bonus does not lift it at out 15', () => {
    assert(fatigue({ cardIp: 4, outsRecorded: 14 }) === 0 && fatigue({ cardIp: 4, outsRecorded: 15 }) === 0, 'Stays at 0.')
  })
  test('V2-FAT-BONUS-LONG-IP', 'Fatigue', 'Card IP 5, shutout: -1 per out from out 15, never below 0 by the bonus', () => {
    const got = [15, 18, 20, 22].map((o) => fatigue({ outsRecorded: o }))
    assert(JSON.stringify(got) === JSON.stringify([5, 2, 0, 0]), `Got ${got}.`)
  })
  test('V2-FAT-BONUS-CHARGED-RUN', 'Fatigue', 'Bonus broken by a charged run at out 19: Control 1 -> -1 at once, -3 after the next out', () => {
    assert(fatigue({ outsRecorded: 19, earnedRunsAllowed: 1, shutoutBonusBrokenAtOuts: 19 }) === -1, 'Immediate -2.')
    assert(fatigue({ outsRecorded: 20, earnedRunsAllowed: 1, shutoutBonusBrokenAtOuts: 19 }) === -3, '-2 per later out.')
  })
  test('V2-FAT-BONUS-INHERITED', 'Fatigue', 'Option B: inherited run at out 19 ends the bonus -- Control stays 1, then -1 after the next out', () => {
    assert(fatigue({ outsRecorded: 19, inheritedRunnersScored: 1, shutoutBonusEndedAtOuts: 19 }) === 1, 'No immediate -2.')
    assert(fatigue({ outsRecorded: 20, inheritedRunnersScored: 1, shutoutBonusEndedAtOuts: 19 }) === -1, '-2 per later out.')
  })
  test('V2-FAT-INHERITED-BEFORE-BONUS', 'Fatigue', 'An inherited run before out 15 means no bonus at all: ordinary -2 per out', () => {
    assert(fatigue({ outsRecorded: 16, inheritedRunnersScored: 1 }) === 2, 'Ordinary progression.')
  })

  // ---------------------------------------------------------------- in-progress games keep their rules (rulesVersion)
  test('V1-COMPAT-SQUEEZE', 'Rules version', 'A game created before v2 keeps v1: squeeze 16-19 with two out still scores, and no play log is written', () => {
    const v1 = { ...v2(initial, { outs: 2, runners: { third: 3 } }), rulesVersion: undefined, playLog: undefined }
    let s = confirm(beginPrePitchDecision(v1, 'SQUEEZE_BUNT'), 'CONFIRM_SQUEEZE')
    s = roll(s, 17)
    assert(s.score.away === 1 && s.playLog === undefined, `v1 behaviour: score ${s.score.away}, log ${s.playLog ? 'present' : 'absent'}.`)
  })
  test('V1-COMPAT-WALKOFF', 'Rules version', 'A v1 game keeps v1 walk-offs (no mid-game rule change): both runs count and the extra-base decision is still offered', () => {
    const v1 = { ...v2(initial, { inning: 9, half: 'bottom', score: { away: 4, home: 4 }, runners: { second: 2, third: 3 } }), rulesVersion: undefined, playLog: undefined }
    const s = swing(v1, '2B')
    assert(s.score.home === 6 && s.pendingDecision?.decisionType === 'EXTRA_BASE_DECISION', `v1: ${s.score.home} runs, ${s.pendingDecision?.decisionType}.`)
  })
  test('V1-COMPAT-NO-LOCK', 'Rules version', 'A v1 game offers manager actions after a steal, as before', () => {
    const v1 = { ...v2(initial, { runners: { first: 1 } }), rulesVersion: undefined, playLog: undefined }
    const s = stealOnce(v1, 1)
    assert(preActions(s).includes('INTENTIONAL_WALK'), 'v1 has no lock.')
  })

  // ---------------------------------------------------------------- stolen bases and plate-appearance ownership (audit decision 10)
  test('V2-SB-MULTI-TARGET-OUT', 'Stolen bases', 'EDSR-SB: double steal, the lead runner thrown out -- CS for him; the trailing runner advances with no SB', () => {
    let s = beginPrePitchDecision(v2(initial, { runners: { first: 1, second: 2 } }), 'NATURAL_STEAL')
    s = confirmManagerDecision(s, optionIds(s))
    const lead = optionIds(s).find((id) => id.includes('2B->3B'))
    assert(lead, 'Defense should be able to throw at the lead runner.')
    s = roll(confirm(s, lead), 20)
    const play = lastPlay(s)
    assert(play.steals.length === 1 && play.steals[0].success === false && play.steals[0].runnerKey === runnerKeyOf(s, 2), `Steals ${JSON.stringify(play.steals)}.`)
    assert(keyAt(s, 'second') === runnerKeyOf(s, 1) && s.outs === 1, 'Trailing runner on 2B, one out.')
  })
  test('V2-PA-OWNERSHIP', 'Plate appearances', 'EDSR-PA: a pinch hitter sent up before any roll owns the whole plate appearance', () => {
    let s = beginPrePitchDecision(v2(initial), 'PINCH_HITTER')
    s = confirm(s, optionIds(s)[0])
    s = confirm(s, 'CARD_ATTRIBUTES')
    const pinch = s.plateAppearance.batterCardKey
    s = swing(s, 'K')
    const play = lastPlay(s)
    assert(play.batterKey === pinch && play.batterKey !== order(v2(initial), 'away')[0], `PA belongs to ${play.batterKey}.`)
  })

  // ---------------------------------------------------------------- play log invariants
  test('V2-LOG-SEQUENCE', 'Play log', 'Plays are numbered in order and each records the bases, outs and score before and after', () => {
    let s = v2(initial, { runners: { first: 1 } })
    s = swing(s, '1B')
    s = confirm(s, 'DECLINE_EXTRA_BASES')
    s = swing(s, 'K')
    const plays = s.playLog!.plays
    assert(plays.map((p) => p.seq).join(',') === '1,2', `Sequence ${plays.map((p) => p.seq)}.`)
    assert(plays[0].basesBefore.length === 1 && plays[0].basesAfter.length === 2 && plays[1].outsAfter === 1, 'Before/after recorded.')
  })

  const total = results.length
  const passed = results.filter((r) => r.passed).length
  const categories: ScenarioReport['categories'] = {}
  for (const r of results) {
    const c = (categories[r.category] ??= { total: 0, passed: 0 })
    c.total++
    if (r.passed) c.passed++
  }
  return { total, passed, failed: total - passed, categories, results }
}


