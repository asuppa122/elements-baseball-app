import { describe, expect, it } from 'vitest'
import { currentHitterOnBaseAdjustment, currentPitcherControlAdjustment } from '../inGameFatigueDisplay'
import { buildNonGbCoverageFixture } from '../../rulebookCoverage'
import { attachRestState, effectiveCurrentHitterOnBase, effectiveCurrentPitcherControl } from '../../engine'
import { pitcherInstanceKey } from '../../pitcherStateKey'
import type { GameState } from '../../types'

// Phase 1 (GAMEPLAY_PRESENTATION_PLAN.md) in-game fatigue display. This is a
// presentation derivation, not gameplay logic, so it is tested directly here
// rather than added to a scenario harness -- the same split
// pregameFatigueDisplay.test.ts and sequence.test.ts already use. The engine
// formulas themselves stay covered by the fatigue harness; what's asserted
// here is that the *displayed* delta and its attribution match the numbers a
// real roll would use, and that default attributes are never mislabelled as
// fatigue.
//
// Fixture facts (buildNonGbCoverageFixture, verified not assumed): batter
// AWAY-0 prints On Base 8; pitcher HOME-8 prints Control 5 at 7.33 IP, which
// is 22 outs of card distance. half='top', so away bats and home pitches.

function fixture(): GameState {
  const s = structuredClone(buildNonGbCoverageFixture())
  s.half = 'top'
  s.plateAppearance = { ...s.plateAppearance, batterCardKey: 'AWAY-0', pitcherCardKey: 'HOME-8' }
  return s
}

/** Puts the home pitcher this far into his appearance, with this many earned runs. */
function pitcherWorkload(s: GameState, args: { inning?: number; earnedRuns?: number }): GameState {
  const next = structuredClone(s)
  if (args.inning !== undefined) next.inning = args.inning
  if (args.earnedRuns !== undefined) {
    next.pitcherRunsAllowed = { [pitcherInstanceKey('home', 'HOME-8')]: args.earnedRuns }
  }
  return next
}

describe('currentHitterOnBaseAdjustment', () => {
  it('returns null for a rested hitter on card attributes -- renders exactly as before', () => {
    expect(currentHitterOnBaseAdjustment(fixture())).toBeNull()
  })

  it('reports rest debt as FATIGUE, attributed to REST', () => {
    const s = attachRestState(fixture(), 'away', { 'AWAY-0': { hitterGamesRemaining: 2, pitcherGamesRemaining: 0 } })
    expect(currentHitterOnBaseAdjustment(s)).toEqual({ kind: 'FATIGUE', printed: 8, effective: 6, causes: ['REST'] })
  })

  it('the reported effective value is the one a real roll uses, not a parallel calculation', () => {
    const s = attachRestState(fixture(), 'away', { 'AWAY-0': { hitterGamesRemaining: 3, pitcherGamesRemaining: 0 } })
    const adjustment = currentHitterOnBaseAdjustment(s)
    expect(adjustment?.effective).toBe(effectiveCurrentHitterOnBase(s))
  })

  // The bug this piece exists to fix: a pinch hitter entering on default
  // attributes drops to a flat On Base 5, which is not fatigue at all. Showing
  // it as "8 -> 5" with the fatigue treatment would claim an exhausted hitter.
  it('labels default attributes as DEFAULT_ATTRIBUTES, never as FATIGUE', () => {
    const s = fixture()
    s.pregame.away.defaultBatterCardKeys = ['AWAY-0']
    const adjustment = currentHitterOnBaseAdjustment(s)
    expect(adjustment).toEqual({ kind: 'DEFAULT_ATTRIBUTES', printed: 8, effective: 5 })
    expect(adjustment?.kind).not.toBe('FATIGUE')
  })

  it('still reports the cause when the On Base floor absorbs the whole penalty', () => {
    // Printed 5 is already the floor, so rest debt changes nothing visible --
    // but the debt is real, so callers get the cause with no arrow to draw.
    const s = attachRestState(fixture(), 'away', { 'AWAY-0': { hitterGamesRemaining: 4, pitcherGamesRemaining: 0 } })
    s.pregame.away.roster!.cards['AWAY-0'].hitter.onBase = 5
    expect(currentHitterOnBaseAdjustment(s)).toEqual({ kind: 'FATIGUE', printed: 5, effective: 5, causes: ['REST'] })
  })
})

describe('currentPitcherControlAdjustment', () => {
  it('returns null for a rested starter in the first inning on card attributes', () => {
    expect(currentPitcherControlAdjustment(fixture())).toBeNull()
  })

  it('reports rest debt as FATIGUE, attributed to REST', () => {
    const s = attachRestState(fixture(), 'home', { 'HOME-8': { hitterGamesRemaining: 0, pitcherGamesRemaining: 3 } })
    expect(currentPitcherControlAdjustment(s)).toEqual({ kind: 'FATIGUE', printed: 5, effective: 2, causes: ['REST'] })
  })

  it('attributes earned runs to PERFORMANCE', () => {
    // 4 earned runs is the first performance tier (-1).
    const s = pitcherWorkload(fixture(), { earnedRuns: 4 })
    expect(currentPitcherControlAdjustment(s)).toEqual({ kind: 'FATIGUE', printed: 5, effective: 4, causes: ['PERFORMANCE'] })
  })

  it('attributes work past card IP to DISTANCE', () => {
    // 8 innings pitched = 24 outs, past HOME-8's 22 outs of card distance.
    const s = pitcherWorkload(fixture(), { inning: 9 })
    const adjustment = currentPitcherControlAdjustment(s)
    expect(adjustment?.kind).toBe('FATIGUE')
    expect(adjustment && 'causes' in adjustment ? adjustment.causes : []).toEqual(['DISTANCE'])
    expect(adjustment?.effective).toBe(effectiveCurrentPitcherControl(s))
    expect(adjustment?.effective).toBeLessThan(5)
  })

  it('reports every active cause together, in rest/performance/distance order', () => {
    let s = pitcherWorkload(fixture(), { inning: 9, earnedRuns: 4 })
    s = attachRestState(s, 'home', { 'HOME-8': { hitterGamesRemaining: 0, pitcherGamesRemaining: 1 } })
    const adjustment = currentPitcherControlAdjustment(s)
    expect(adjustment && 'causes' in adjustment ? adjustment.causes : []).toEqual(['REST', 'PERFORMANCE', 'DISTANCE'])
    expect(adjustment?.effective).toBe(effectiveCurrentPitcherControl(s))
  })

  it('labels default attributes as DEFAULT_ATTRIBUTES at the -5 floor, never as FATIGUE', () => {
    const s = fixture()
    s.pregame.home.defaultPitcherCardKeys = ['HOME-8']
    const adjustment = currentPitcherControlAdjustment(s)
    expect(adjustment).toEqual({ kind: 'DEFAULT_ATTRIBUTES', printed: 5, effective: -5 })
    expect(adjustment?.kind).not.toBe('FATIGUE')
  })

  it('treats a card with no printed Control as DEFAULT_ATTRIBUTES, with a null printed value', () => {
    const s = fixture()
    s.pregame.home.roster!.cards['HOME-8'].pitcher.control = null
    expect(currentPitcherControlAdjustment(s)).toEqual({ kind: 'DEFAULT_ATTRIBUTES', printed: null, effective: -5 })
  })

  it('still reports causes when the -5 clamp absorbs the whole penalty', () => {
    // Boundary case for the clamp documented on RatingAdjustment: at the floor
    // the penalties are real but produce no visible delta, so the module must
    // not silently return null and hide them.
    const s = attachRestState(fixture(), 'home', { 'HOME-8': { hitterGamesRemaining: 0, pitcherGamesRemaining: 2 } })
    s.pregame.home.roster!.cards['HOME-8'].pitcher.control = -5
    expect(currentPitcherControlAdjustment(s)).toEqual({ kind: 'FATIGUE', printed: -5, effective: -5, causes: ['REST'] })
  })

  it('a wrong attribution would fail this -- a rested first-inning starter has no causes at all', () => {
    // Guards against the module reporting causes unconditionally, which would
    // still pass every "cause is present" assertion above.
    const s = fixture()
    expect(currentPitcherControlAdjustment(s)).toBeNull()
    const withRest = attachRestState(s, 'home', { 'HOME-8': { hitterGamesRemaining: 0, pitcherGamesRemaining: 1 } })
    const adjustment = currentPitcherControlAdjustment(withRest)
    expect(adjustment && 'causes' in adjustment ? adjustment.causes : []).not.toContain('DISTANCE')
    expect(adjustment && 'causes' in adjustment ? adjustment.causes : []).not.toContain('PERFORMANCE')
  })
})
