import { describe, expect, it } from 'vitest'
import { narrate } from '../playNarration'

const ev = (payload: Record<string, unknown>) => ({ state_version: 1, payload })

// Narration must come only from what the engine recorded. The test that
// matters most is the one asserting silence when the payload cannot support a
// sentence -- that is the difference between reporting and inventing.

describe('narrate', () => {
  it('says nothing at all for a thin pre-widening shell payload', () => {
    expect(narrate(ev({ roll: 12, chartResult: 'HR', playableShell: true }))).toBeNull()
  })

  it('says nothing when there is a batter but no chart result', () => {
    expect(narrate(ev({ batter: 'Otto Briggs' }))).toBeNull()
  })

  it('narrates a home run with the runs it actually drove in', () => {
    const n = narrate(ev({
      batter: 'Bobby Williams', chartResult: 'HR',
      score: { away: 1, home: 0 }, resultingScore: { away: 1, home: 3 },
      outs: 1, resultingOuts: 1,
    }))
    expect(n).toMatchObject({ runs: 3, kind: 'scoring' })
    expect(n!.text).toBe('Bobby Williams homers, 3 runs score.')
  })

  it('counts a walk that forces in a run', () => {
    const n = narrate(ev({
      batter: 'Ben Taylor', chartResult: 'BB',
      score: { away: 0, home: 0 }, resultingScore: { away: 0, home: 1 },
      outs: 2, resultingOuts: 2,
    }))
    expect(n!.text).toBe('Ben Taylor walks, 1 run scores.')
  })

  it('only says "grounds out" when an out was actually recorded', () => {
    const out = narrate(ev({ batter: 'A', chartResult: 'GB', outs: 0, resultingOuts: 1,
      score: { away: 0, home: 0 }, resultingScore: { away: 0, home: 0 } }))
    expect(out!.text).toBe('A grounds out.')
    expect(out!.kind).toBe('out')

    // Same chart result, nobody out -- the batter reached.
    const safe = narrate(ev({ batter: 'B', chartResult: 'GB', outs: 1, resultingOuts: 1,
      score: { away: 0, home: 0 }, resultingScore: { away: 0, home: 0 },
      bases: { first: null, second: null, third: null },
      resultingBases: { first: { cardKey: 'B' }, second: null, third: null } }))
    expect(safe!.text).toBe('B grounds.')
    expect(safe!.kind).toBe('onbase')
  })

  it('treats an inning-ending third out as an out even though the count resets', () => {
    const n = narrate(ev({ batter: 'C', chartResult: 'FB', outs: 2, resultingOuts: 0,
      score: { away: 0, home: 0 }, resultingScore: { away: 0, home: 0 } }))
    expect(n!.kind).toBe('out')
    expect(n!.text).toBe('C flies out.')
  })

  it('reads a runner reaching base as onbase, not neutral', () => {
    const n = narrate(ev({ batter: 'D', chartResult: '2B', outs: 0, resultingOuts: 0,
      score: { away: 0, home: 0 }, resultingScore: { away: 0, home: 0 },
      bases: { first: null, second: null, third: null },
      resultingBases: { first: null, second: { cardKey: 'D' }, third: null } }))
    expect(n).toMatchObject({ kind: 'onbase', runs: 0 })
    expect(n!.text).toBe('D doubles.')
  })

  it('falls back to the raw chart code rather than inventing a phrase for one it does not know', () => {
    const n = narrate(ev({ batter: 'E', chartResult: 'WEIRD', outs: 0, resultingOuts: 0,
      score: { away: 0, home: 0 }, resultingScore: { away: 0, home: 0 } }))
    expect(n!.text).toBe('E WEIRD.')
  })
})
