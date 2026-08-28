import { describe, expect, it } from 'vitest'
import { creditRunsToInning, lineScore, runsInInning } from '../inningScore'
import { resolveCoreResult } from '../coreGame'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'
import type { GameState } from '../types'

// Per-inning run tracking. The pure helper is tested directly here; the
// scenario harness proves runs actually land in the right bucket when driven
// through the real engine (LINE-01..04 in scenarioHarness.ts).

describe('creditRunsToInning', () => {
  it('credits a run to the inning it scored in, not the end of the array', () => {
    const r = creditRunsToInning(undefined, 'away', 3, 1)
    expect(r.away).toEqual([0, 0, 1])
    expect(r.home).toEqual([])
  })

  it('pads earlier innings with 0 rather than leaving holes', () => {
    // a sparse array serialises to nulls in the persisted GameState JSON
    const r = creditRunsToInning(undefined, 'home', 5, 2)
    expect(r.home).toEqual([0, 0, 0, 0, 2])
    expect(r.home.every((v) => typeof v === 'number')).toBe(true)
  })

  it('accumulates within one inning instead of overwriting', () => {
    let r = creditRunsToInning(undefined, 'away', 2, 1)
    r = creditRunsToInning(r, 'away', 2, 3)
    expect(r.away).toEqual([0, 3 + 1])
  })

  it('keeps the two sides independent', () => {
    let r = creditRunsToInning(undefined, 'away', 1, 2)
    r = creditRunsToInning(r, 'home', 1, 5)
    expect(r.away).toEqual([2])
    expect(r.home).toEqual([5])
  })

  it('extends into extra innings without special-casing them', () => {
    const r = creditRunsToInning({ away: [0,0,0,0,0,0,0,0,0], home: [] }, 'away', 12, 1)
    expect(r.away.length).toBe(12)
    expect(r.away[11]).toBe(1)
  })

  it('does not mutate the record it was given', () => {
    const before = { away: [1], home: [0] }
    const after = creditRunsToInning(before, 'away', 1, 4)
    expect(before.away).toEqual([1])
    expect(after.away).toEqual([5])
  })
})

describe('lineScore', () => {
  it('pads both sides to the same length so the two rows line up', () => {
    const s = { runsByInning: { away: [1, 0, 2], home: [0] }, inning: 3 } as unknown as GameState
    expect(lineScore(s)).toEqual({ away: [1, 0, 2], home: [0, 0, 0], innings: 3 })
  })

  it('runs at least as far as the current inning even before anyone scores', () => {
    const s = { runsByInning: { away: [], home: [] }, inning: 4 } as unknown as GameState
    expect(lineScore(s)).toEqual({ away: [0,0,0,0], home: [0,0,0,0], innings: 4 })
  })

  it('a game persisted before the field existed reads as an empty line score, not a crash', () => {
    const s = { inning: 2 } as unknown as GameState
    expect(lineScore(s)).toEqual({ away: [0,0], home: [0,0], innings: 2 })
    expect(runsInInning(s, 'away', 1)).toBe(0)
  })
})

describe('through the real engine', () => {
  it('a home run credits the inning the game is actually in', () => {
    const s = structuredClone(buildNonGbCoverageFixture()) as GameState
    s.half = 'top'; s.inning = 7; s.outs = 0
    s.score = { away: 0, home: 0 }
    s.runsByInning = { away: [], home: [] }
    s.bases = { first: null, second: null, third: null }
    const next = resolveCoreResult(s, 'HR')
    expect(next.score.away).toBe(1)
    expect(runsInInning(next, 'away', 7)).toBe(1)
    // and nowhere else
    expect(next.runsByInning!.away.slice(0, 6)).toEqual([0,0,0,0,0,0])
    expect(next.runsByInning!.home).toEqual([])
  })

  it('the per-inning buckets always sum to the running score', () => {
    let s = structuredClone(buildNonGbCoverageFixture()) as GameState
    s.half = 'top'; s.inning = 2; s.outs = 0
    s.score = { away: 0, home: 0 }; s.runsByInning = { away: [], home: [] }
    s.bases = { first: null, second: null, third: null }
    s = resolveCoreResult(s, 'HR')
    s = { ...s, inning: 5, bases: { first: null, second: null, third: null } }
    s = resolveCoreResult(s, 'HR')
    const sum = (s.runsByInning?.away ?? []).reduce((a, b) => a + b, 0)
    expect(sum).toBe(s.score.away)
    expect(s.runsByInning!.away[1]).toBe(1)
    expect(s.runsByInning!.away[4]).toBe(1)
  })
})
