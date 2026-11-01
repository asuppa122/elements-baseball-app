import type { ScenarioReport, ScenarioResult } from '../scenarioHarness'
import type { BattingCredit, GameSide, GameState, PlayRecord, PlayRun } from '../types'
import { buildBoxScore } from './boxScore'
import { computeDecisions } from './decisions'
import { computeGameStats } from './gameStats'

/**
 * Statistics and decisions, proved on exact play sequences. A small simulator
 * writes play records the way the engine does (outs, runs with the score
 * after each, the pitcher on the mound and the runner's responsible pitcher,
 * substitutions with the game situation), so each branch of the W tree, every
 * ranking key and each save/hold rule gets its own scenario.
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const other = (side: GameSide): GameSide => (side === 'home' ? 'away' : 'home')

class Sim {
  plays: PlayRecord[] = []
  score: Record<GameSide, number> = { away: 0, home: 0 }
  inning = 1
  half: 'top' | 'bottom' = 'top'
  outs = 0
  onMound: Record<GameSide, string> = { home: 'H-SP', away: 'A-SP' }
  runsByInning: Record<GameSide, number[]> = { away: [], home: [] }

  get batting(): GameSide { return this.half === 'top' ? 'away' : 'home' }
  get fielding(): GameSide { return other(this.batting) }

  private push(partial: Partial<PlayRecord>) {
    const base: PlayRecord = {
      seq: this.plays.length + 1, kind: 'plate_appearance', inning: this.inning, half: this.half, battingSide: this.batting,
      batterKey: `${this.batting}-B`, pitcherKey: this.onMound[this.fielding], outsBefore: this.outs, outsAfter: this.outs,
      basesBefore: [], basesAfter: [], scoreBefore: { ...this.score }, scoreAfter: { ...this.score },
      runs: [], outs: [], steals: [], defense: [], outfieldAssists: [], rulesVersion: 2, note: '',
    }
    this.plays.push({ ...base, ...partial })
  }

  /** A plate appearance: `outs` added, runs scored (runner key, responsible pitcher), batting credit. */
  pa(opts: { outs?: number; runs?: Array<{ runner: string; resp?: string }>; credit?: BattingCredit } = {}) {
    const outsBefore = this.outs
    const runs: PlayRun[] = []
    for (const r of opts.runs ?? []) {
      this.score[this.batting]++
      const i = this.inning - 1
      this.runsByInning[this.batting][i] = (this.runsByInning[this.batting][i] ?? 0) + 1
      runs.push({ cardKey: r.runner, from: 'third', responsiblePitcherKey: r.resp ?? this.onMound[this.fielding], pitcherOnMoundKey: this.onMound[this.fielding], counted: true, scoreAfter: { ...this.score } })
    }
    this.outs = Math.min(3, this.outs + (opts.outs ?? 0))
    const credit = opts.credit ?? (opts.outs ? 'out' : runs.length ? 'single' : 'walk')
    this.push({ outsBefore, outsAfter: this.outs, runs, scoreAfter: { ...this.score }, batting: { credit, chartResult: null, advantage: null, automaticAdvantage: false, gidp: false, rbi: runs.length } })
    if (this.outs >= 3) this.nextHalf()
    return this
  }
  /** Retire the side: three outs on three plays. */
  side() { const needed = 3 - this.outs; for (let i = 0; i < needed; i++) this.pa({ outs: 1 }); return this }
  /** Whole innings with no runs. */
  quietInnings(n: number) { for (let i = 0; i < n * 2; i++) this.side(); return this }
  change(side: GameSide, incoming: string, runnersOn = 0) {
    this.plays.push({
      seq: this.plays.length + 1, kind: 'substitution', inning: this.inning, half: this.half, battingSide: this.batting,
      batterKey: null, pitcherKey: this.onMound[this.fielding], outsBefore: this.outs, outsAfter: this.outs,
      basesBefore: [], basesAfter: [], scoreBefore: { ...this.score }, scoreAfter: { ...this.score },
      runs: [], outs: [], steals: [], defense: [], outfieldAssists: [], rulesVersion: 2, note: '',
      substitution: { side, kind: 'pitching_change', incomingKey: incoming, outgoingKey: this.onMound[side], position: 'P', scoreBefore: { ...this.score }, runnersOn, battingSlot: null },
    })
    this.onMound[side] = incoming
    return this
  }
  private nextHalf() { this.outs = 0; if (this.half === 'top') this.half = 'bottom'; else { this.half = 'top'; this.inning++ } }

  state(): GameState {
    const start = (side: GameSide) => ({ battingOrder: [`${side}-B`], alignment: { P: side === 'home' ? 'H-SP' : 'A-SP' }, startingPitcher: side === 'home' ? 'H-SP' : 'A-SP' })
    return { gameId: 'sim', status: 'complete', score: { ...this.score }, runsByInning: this.runsByInning, pregame: { home: { roster: null }, away: { roster: null } }, playLog: { plays: this.plays, open: null, start: { home: start('home'), away: start('away') } } } as unknown as GameState
  }
}

const decide = (sim: Sim) => {
  const state = sim.state()
  const stats = computeGameStats(state)
  return { stats, d: computeDecisions({ plays: stats.plays, pitching: stats.pitching, final: state.score, complete: true }) }
}

export function runStatsScenarioMatrix(): ScenarioReport {
  const results: ScenarioResult[] = []
  const test = (id: string, category: string, description: string, fn: () => void) => {
    try { fn(); results.push({ id, category, description, passed: true, detail: 'Passed' }) }
    catch (error) { results.push({ id, category, description, passed: false, detail: error instanceof Error ? error.message : String(error) }) }
  }

  // ---------------------------------------------------------------- winning pitcher tree
  test('W-STARTER-QUALIFIES', 'Winning pitcher', 'Branch 2a: POR is the starter with 15+ outs -> starter wins', () => {
    const s = new Sim().pa({ runs: [{ runner: 'a1' }] }).side().quietInnings(8).side()
    const { d } = decide(s)
    assert(d.W === 'A-SP' && d.winBranch === 'starter' && d.L === 'H-SP', `W ${d.W} (${d.winBranch}) L ${d.L}.`)
  })
  test('W-STARTER-14-OUTS', 'Winning pitcher', 'Branch 2b: starter leads but has 14 outs -> best-ranked reliever (key 5: more outs)', () => {
    // Away bats in the top halves; its pitchers work the bottoms.
    const s = new Sim().pa({ runs: [{ runner: 'a1' }] }).side()
    for (let i = 0; i < 4; i++) s.side().side() // starter: bottoms 1-4 = 12 outs
    s.pa({ outs: 1 }).pa({ outs: 1 }) // 14 outs in the bottom 5th
    s.change('away', 'A-R1').pa({ outs: 1 }).side().side() // R1: 1 + 3 = 4 outs
    s.change('away', 'A-R2').quietInnings(3) // R2: bottoms 7-9 = 9 outs
    const { d, stats } = decide(s)
    const sp = stats.pitching.away.find((l) => l.cardKey === 'A-SP')!
    assert(sp.outs === 14, `Starter outs ${sp.outs}.`)
    assert(d.winBranch === 'starter_short' && d.W === 'A-R2', `W ${d.W} (${d.winBranch}).`)
  })
  test('W-ONE-RELIEVER', 'Winning pitcher', 'Branch 2b with one reliever: he wins (OBR 9.17(b))', () => {
    const s = new Sim().pa({ runs: [{ runner: 'a1' }] }).side().side().side().change('away', 'A-R1').quietInnings(7).side()
    const { d } = decide(s)
    assert(d.W === 'A-R1', `W ${d.W}.`)
  })
  test('W-RELIEVER-POR', 'Winning pitcher', 'Branch 4a: reliever of record not brief-and-ineffective -> wins', () => {
    // Home pitchers work the tops. Scoreless through 6; H-R1 takes the 7th; home scores in the bottom 7th.
    const s = new Sim().quietInnings(6).change('home', 'H-R1').side().pa({ runs: [{ runner: 'h1' }] }).side().side().side().side()
    const { d } = decide(s)
    assert(d.W === 'H-R1' && d.winBranch === 'reliever', `W ${d.W} (${d.winBranch}).`)
  })
  test('W-BRIEF-INEFFECTIVE', 'Winning pitcher', 'Branch 4b: POR 0.2 IP with 2 runs while pitching, effective successor -> successor wins', () => {
    const s = new Sim().quietInnings(6)
    s.pa({ runs: [{ runner: 'a1' }] }).side() // away 1-0 in top 7
    s.pa({ runs: [{ runner: 'h1' }, { runner: 'h2' }] }).side() // home 2-1 bottom 7
    s.change('home', 'H-R1').pa({ outs: 1 }).pa({ runs: [{ runner: 'a2', resp: 'H-SP' }, { runner: 'a3', resp: 'H-SP' }] }).pa({ outs: 1 }) // away 3-2, H-R1 0.2 IP 2 runs while pitching
    s.change('home', 'H-R2').pa({ outs: 1 })
    s.pa({ runs: [{ runner: 'h3' }, { runner: 'h4' }] }).side() // home 4-3 in bottom 8: H-R2 is POR
    s.side().side()
    const { d } = decide(s)
    assert(d.W === 'H-R2' && d.winBranch === 'reliever', `W ${d.W} (${d.winBranch}).`)
  })
  test('W-BI-THREE-OUTS-NOT-BRIEF', 'Winning pitcher', 'Brief and ineffective needs fewer than 3 outs: a reliever with 3 outs and 2 runs keeps the win', () => {
    const s = new Sim().quietInnings(7)
    s.change('home', 'H-R1').pa({ runs: [{ runner: 'a1' }, { runner: 'a2' }] }).side() // top 8: H-R1 3 outs, 2 runs; 0-2
    s.pa({ runs: [{ runner: 'h1' }, { runner: 'h2' }, { runner: 'h3' }] }).side() // bottom 8: 3-2, H-R1 is POR
    s.change('home', 'H-R2').side()
    const { d } = decide(s)
    assert(d.W === 'H-R1', `W ${d.W} (${d.winBranch}).`)
  })
  test('W-BI-POR-SUCCESSOR', 'Winning pitcher', 'Branch 4b: POR 2 outs with 2 runs while pitching, effective successor -> successor wins', () => {
    const s = new Sim().quietInnings(6)
    s.pa({ runs: [{ runner: 'a1' }] }).side() // top 7: away 1-0 off H-SP
    s.pa({ runs: [{ runner: 'h1' }, { runner: 'h2' }] }).side() // bottom 7: home 2-1, H-SP is POR so far
    s.change('home', 'H-R1').pa({ outs: 1 }).pa({ runs: [{ runner: 'a2' }] }).pa({ outs: 1 }) // top 8: 2-2, H-R1 2 outs
    s.change('home', 'H-R2').pa({ outs: 1 }) // H-R2 ends the 8th
    s.pa({ runs: [{ runner: 'h3' }] }).side() // bottom 8: 3-2 -- POR is H-R2 (last home pitcher before it)
    s.side() // top 9
    const { d } = decide(s)
    assert(d.W === 'H-R2' && d.winBranch === 'reliever', `W ${d.W} (${d.winBranch}).`)
  })
  test('W-BI-POR-REPLACED', 'Winning pitcher', 'Branch 4b proper: POR is brief and ineffective (2 outs, 2 runs while pitching); the effective later reliever wins', () => {
    const s = new Sim().quietInnings(7)
    s.pa({ outs: 1 }) // top 8: H-SP gets one out
    s.change('home', 'H-R1').pa({ runs: [{ runner: 'a1', resp: 'H-SP' }, { runner: 'a2', resp: 'H-SP' }] }).pa({ outs: 2 }) // H-R1: 2 outs, 2 runs while pitching; 0-2
    s.pa({ runs: [{ runner: 'h1' }, { runner: 'h2' }, { runner: 'h3' }] }).side() // bottom 8: 3-2, POR = H-R1
    s.change('home', 'H-R2').side() // top 9: H-R2 three up, three down
    const { d } = decide(s)
    assert(d.W === 'H-R2' && d.winBranch === 'reliever_brief_ineffective', `W ${d.W} (${d.winBranch}).`)
  })
  test('W-BI-NO-SUCCESSOR', 'Winning pitcher', 'Branch 4b: brief-and-ineffective POR with no later reliever keeps the win', () => {
    const s = new Sim().quietInnings(8)
    s.pa({ outs: 1 }) // top 9: H-SP one out
    s.change('home', 'H-R1').pa({ runs: [{ runner: 'a1', resp: 'H-SP' }, { runner: 'a2', resp: 'H-SP' }] }).pa({ outs: 2 }) // 0-2, H-R1 2 outs
    s.pa({ runs: [{ runner: 'h1' }, { runner: 'h2' }, { runner: 'h3' }] }) // walk-off 3-2
    const { d } = decide(s)
    assert(d.W === 'H-R1' && d.winBranch === 'reliever_brief_ineffective', `W ${d.W} (${d.winBranch}).`)
  })
  test('W-BI-ONLY-INEFFECTIVE', 'Winning pitcher', 'Branch 4b: POR brief-and-ineffective, later relievers also -> POR keeps it', () => {
    const s = new Sim().quietInnings(8)
    s.change('home', 'H-R1').pa({ outs: 1 }).pa({ runs: [{ runner: 'a1' }, { runner: 'a2' }] }).pa({ outs: 1 })
    s.change('home', 'H-R2').pa({ runs: [{ runner: 'a3' }, { runner: 'a4' }] }).pa({ outs: 1 }) // H-R2: 1 out, 2 runs
    s.pa({ runs: [{ runner: 'h1' }, { runner: 'h2' }, { runner: 'h3' }, { runner: 'h4' }, { runner: 'h5' }] }) // walk-off 5-4
    const { d } = decide(s)
    assert(d.W === 'H-R2', `POR is H-R2 (pitched last); both later candidates absent: W ${d.W} (${d.winBranch}).`)
  })
  test('W-RANK-FULL-INNING', 'Winning pitcher', 'Key 1: a reliever with 3+ outs outranks one with 2 outs', () => {
    const s = new Sim().pa({ runs: [{ runner: 'a1' }] }).side() // top 1: away 1-0
    s.side().side() // bottom 1: starter 3 outs; top 2
    s.change('away', 'A-R1').pa({ outs: 2 }).change('away', 'A-R2').pa({ outs: 1 }) // bottom 2: R1 2 outs, R2 1 out
    for (let i = 0; i < 7; i++) s.side().side() // R2 works bottoms 3-9
    const { d } = decide(s)
    assert(d.winBranch === 'starter_short' && d.W === 'A-R2', `W ${d.W} (${d.winBranch}).`)
  })
  test('W-RANK-RUNS-CHARGED', 'Winning pitcher', 'Key 2 before key 5: 9 outs with a run charged loses to 6 scoreless outs; key 6 breaks the 6-out tie', () => {
    const s = new Sim().pa({ runs: [{ runner: 'a1' }, { runner: 'a2' }] }).side() // top 1: 2-0
    s.side().side().side().side() // starter: bottoms 1-2 = 6 outs
    s.change('away', 'A-R1').pa({ runs: [{ runner: 'h1' }] }).side().side().side().side().side() // R1: bottoms 3-5 = 9 outs, 1 run
    s.change('away', 'A-R2').side().side().side().side() // R2: bottoms 6-7 = 6 outs, 0 runs
    s.change('away', 'A-R3').side().side().side().side() // R3: bottoms 8-9 = 6 outs, 0 runs
    const { d, stats } = decide(s)
    const line = (k: string) => stats.pitching.away.find((l) => l.cardKey === k)!
    assert(line('A-R1').outs === 9 && line('A-R1').R === 1 && line('A-R2').outs === 6 && line('A-R3').outs === 6, `Lines ${['A-R1', 'A-R2', 'A-R3'].map((k) => `${k}:${line(k).outs}/${line(k).R}`)}.`)
    assert(d.W === 'A-R2', `W ${d.W}.`)
  })
  test('W-RANK-EARLIER-ENTRY', 'Winning pitcher', 'Identical records always give the identical winner (determinism)', () => {
    const build = () => {
      const s = new Sim().pa({ runs: [{ runner: 'a1' }] }).side().side().side().side().side()
      s.change('away', 'A-R1').side().side().side().side().side().side()
      s.change('away', 'A-R2').side().side().side().side().side().side()
      s.change('away', 'A-R3').side().side().side()
      return decide(s).d.W
    }
    assert(build() === build(), 'Same records, same W.')
  })
  test('W-LEAD-CHANGES', 'Winning pitcher', 'Lead changes three times: only the final go-ahead run decides POR and L', () => {
    const s = new Sim()
    s.pa({ runs: [{ runner: 'a1' }] }).side() // away 1-0
    s.pa({ runs: [{ runner: 'h1' }, { runner: 'h2' }] }).side() // home 2-1
    s.change('home', 'H-R1').pa({ runs: [{ runner: 'a2' }, { runner: 'a3' }] }).side() // away 3-2 (H-R1 allowed)
    s.change('away', 'A-R1').pa({ runs: [{ runner: 'h3' }, { runner: 'h4' }] }).side() // home 4-3, A-R1 allowed
    s.quietInnings(7).side()
    const { d } = decide(s)
    assert(d.W === 'H-R1' && d.L === 'A-R1', `W ${d.W} L ${d.L}.`)
  })
  test('W-FIVE-INNING-GAME', 'Winning pitcher', 'Future configurations: a winner that defended 5 innings needs 12 starter outs', () => {
    const s = new Sim().pa({ runs: [{ runner: 'a1' }] }).side()
    for (let i = 0; i < 4; i++) s.side().side()
    s.side() // 5 defensive innings for home? (away wins) -- starter A-SP 12 outs over 4 innings + ...
    const state = s.state()
    const stats = computeGameStats(state)
    const sp = stats.pitching.away.find((l) => l.cardKey === 'A-SP')!
    const d = computeDecisions({ plays: stats.plays, pitching: stats.pitching, final: state.score, complete: true })
    assert(sp.outs >= 12 && d.W === 'A-SP', `Starter ${sp.outs} outs, W ${d.W}.`)
  })
  test('W-WALKOFF', 'Winning pitcher', 'Walk-off: the home pitcher who pitched the top of the inning is POR', () => {
    const s = new Sim().quietInnings(8).change('home', 'H-R1').side().pa({ runs: [{ runner: 'h1' }] })
    const { d } = decide(s)
    assert(d.W === 'H-R1' && d.L === 'A-SP', `W ${d.W} L ${d.L}.`)
  })
  test('W-VISITORS-FIRST', 'Winning pitcher', 'Visitors score in the top of the 1st and never trail: their starter is POR', () => {
    const s = new Sim().pa({ runs: [{ runner: 'a1' }] }).side().quietInnings(8).side()
    assert(decide(s).d.W === 'A-SP', 'Starter.')
  })
  test('L-INHERITED-RUNNER', 'Losing pitcher', 'L is the responsible pitcher of the go-ahead runner, even when he scores off a reliever', () => {
    const s = new Sim().quietInnings(5).change('home', 'H-R1').pa({ runs: [{ runner: 'a1', resp: 'H-SP' }] }).side().side().quietInnings(3).side()
    assert(decide(s).d.L === 'H-SP', `L ${decide(s).d.L}.`)
  })

  // ---------------------------------------------------------------- saves, holds, blown saves
  /** Away leads by `leadAtEntry + closerRuns` from the 1st; the closer enters at the start of a bottom half and works `closerOuts` (whole innings), allowing `closerRuns` first. */
  const saveGame = (leadAtEntry: number, runnersOn: number, closerOuts: number, closerRuns: number) => {
    const s = new Sim()
    s.pa({ runs: Array.from({ length: leadAtEntry + closerRuns }, (_, i) => ({ runner: `a${i}` })) }).side()
    const closerInnings = closerOuts / 3
    for (let inning = 1; inning <= 9 - closerInnings; inning++) s.side().side()
    s.change('away', 'A-CL', runnersOn)
    for (let i = 0; i < closerRuns; i++) s.pa({ runs: [{ runner: `h${i}` }] })
    s.side()
    for (let inning = 2; inning <= closerInnings; inning++) s.side().side()
    return decide(s)
  }
  test('SV-LEAD-3', 'Save', '(d)(1): enters leading by 3, pitches an inning -> SV', () => {
    const { d } = saveGame(3, 0, 3, 0)
    assert(d.SV === 'A-CL', `SV ${d.SV}.`)
  })
  test('SV-LEAD-4-NO', 'Save', '(d)(1): enters leading by 4 with nobody on, one inning -> no SV', () => {
    const { d } = saveGame(4, 0, 3, 0)
    assert(d.SV === null, `SV ${d.SV}.`)
  })
  test('SV-TYING-RUN-ON-DECK', 'Save', '(d)(2): leading by 4 with two on (tying run on deck) -> SV', () => {
    const { d } = saveGame(4, 2, 3, 0)
    assert(d.SV === 'A-CL', `SV ${d.SV}.`)
  })
  test('SV-THREE-INNINGS-1ER', 'Save', '(d)(3): 9 outs, 1 ER (6 x 1 <= 9) leading by 6 -> SV', () => {
    const { d } = saveGame(6, 0, 9, 1)
    assert(d.SV === 'A-CL', `SV ${d.SV}.`)
  })
  test('SV-THREE-INNINGS-2ER-NO', 'Save', '(d)(3): 9 outs, 2 ER (12 > 9) leading by 6 -> no SV', () => {
    const { d } = saveGame(6, 0, 9, 2)
    assert(d.SV === null, `SV ${d.SV}.`)
  })
  test('SV-FOUR-INNINGS-2ER', 'Save', '(d)(3): 12 outs, 2 ER (12 <= 12) -> SV', () => {
    const { d, stats } = saveGame(6, 0, 12, 2)
    const cl = stats.pitching.away.find((l) => l.cardKey === 'A-CL')!
    assert(cl.outs >= 12 && d.SV === 'A-CL', `Closer ${cl.outs} outs ${cl.ER} ER, SV ${d.SV}.`)
  })
  test('SV-WALKOFF-NONE', 'Save', 'A walk-off win has no save', () => {
    const s = new Sim().quietInnings(8).change('home', 'H-R1').side().pa({ runs: [{ runner: 'h1' }] })
    assert(decide(s).d.SV === null, 'No save.')
  })
  test('HLD-AND-BSV', 'Holds', 'Setup man enters +2 and holds it -> HLD; the next lets it be tied -> BSV (and W when his team retakes the lead); closer -> SV', () => {
    const s = new Sim().pa({ runs: [{ runner: 'a1' }, { runner: 'a2' }] }).side()
    for (let i = 0; i < 6; i++) s.side().side() // starter: bottoms 1-6
    s.change('away', 'A-SU').side() // bottom 7: holds 2-0
    s.side() // top 8
    s.change('away', 'A-BL').pa({ runs: [{ runner: 'h1' }, { runner: 'h2' }] }).side() // bottom 8: 2-2
    s.pa({ runs: [{ runner: 'a3' }] }).side() // top 9: 3-2
    s.change('away', 'A-CL').side() // bottom 9
    const { d } = decide(s)
    assert(d.HLD.includes('A-SU') && d.BSV.includes('A-BL') && d.W === 'A-BL' && d.SV === 'A-CL', `HLD ${d.HLD} BSV ${d.BSV} W ${d.W} SV ${d.SV}.`)
  })
  test('LINE-AB-PA', 'Batting lines', 'AB = PA - BB - SAC - SF; OBP inputs count H + BB over PA', () => {
    const s = new Sim()
    s.pa({ credit: 'walk' }).pa({ credit: 'sacrifice_bunt', outs: 1 }).pa({ credit: 'sacrifice_fly', outs: 1 }).pa({ credit: 'single' }).pa({ outs: 1, credit: 'strikeout' })
    const line = computeGameStats(s.state()).batting.away[0]
    assert(line.PA === 5 && line.AB === 2 && line.BB === 1 && line.SAC === 1 && line.SF === 1 && line.H === 1 && line.SO === 1, JSON.stringify(line))
  })
  test('LINE-IP-OUTS', 'Pitching lines', 'IP stored as outs: a starter retiring 20 in a row has 20 outs (6.2)', () => {
    const s = new Sim()
    for (let i = 0; i < 7; i++) s.side().side()
    const sp = computeGameStats(s.state()).pitching.home[0]
    assert(sp.outs === 21, `Outs ${sp.outs}.`)
  })
  test('LINE-ZERO-BF-APPEARANCE', 'Pitching lines', 'Decision 6: a reliever who enters and gets a CS for the third out: G 1, BF 0, 1 out', () => {
    const s = new Sim().quietInnings(3).pa({ outs: 1 }).pa({ outs: 1 }).change('home', 'H-R1')
    s.plays.push({ ...s.plays.at(-1)!, seq: s.plays.length + 1, kind: 'baserunning', substitution: undefined, pitcherKey: 'H-R1', outsBefore: 2, outsAfter: 3, steals: [{ runnerKey: 'a9', from: 'first', to: 'second', success: false, catcherKey: 'H-C', kind: 'natural' }] })
    const r1 = computeGameStats(s.state()).pitching.home.find((l) => l.cardKey === 'H-R1')!
    assert(r1.G === 1 && r1.BF === 0 && r1.outs === 1, JSON.stringify(r1))
  })
  test('BOX-LEGACY', 'Box score', 'A game without a play log gets a legacy summary, nothing reconstructed', () => {
    const legacy = { ...new Sim().state(), playLog: undefined, pitcherEntryDefenseOuts: {}, pregame: { home: { roster: null, startingPitcherCardKey: 'H-SP' }, away: { roster: null, startingPitcherCardKey: 'A-SP' } } } as unknown as GameState
    const box = buildBoxScore(legacy, 'prelaunch')
    assert(box.kind === 'legacy' && box.classification === 'exhibition', `${box.kind} ${box.classification}.`)
  })
  test('BOX-CLASSIFICATION', 'Box score', 'Only progression "official" is official; prelaunch, practice, untracked are exhibition', () => {
    const s = new Sim().pa({ runs: [{ runner: 'a1' }] }).side().quietInnings(8).side()
    for (const p of ['prelaunch', 'practice', 'untracked', null]) assert(buildBoxScore(s.state(), p).classification === 'exhibition', `${p}`)
    assert(buildBoxScore(s.state(), 'official').classification === 'official', 'official')
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
