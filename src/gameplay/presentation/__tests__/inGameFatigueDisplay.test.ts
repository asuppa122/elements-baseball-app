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
    // The single earned run matters: with a clean sheet this same workload is
    // the Shutout Bonus, not overwork (see the SHUTOUT_BONUS cases below).
    // One run is under the 4-run performance tier, so DISTANCE stands alone.
    const s = pitcherWorkload(fixture(), { inning: 9, earnedRuns: 1 })
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

  // The Shutout Bonus is a reward, not overwork: -1/out instead of -2/out,
  // floored at 0. Reporting it as DISTANCE told a manager holding a shutout
  // that his pitcher was breaking down. HOME-8 prints Control 5 at 7.33 IP
  // (22 outs), so 9 innings of defense with 0 earned runs is 27 outs -- 5 past
  // the limit, paying 5 and landing exactly on the floor.
  it('attributes a shutout past card IP to SHUTOUT_BONUS, not DISTANCE', () => {
    const s = pitcherWorkload(fixture(), { inning: 10 })
    const adjustment = currentPitcherControlAdjustment(s)
    expect(adjustment).toEqual({ kind: 'FATIGUE', printed: 5, effective: 0, causes: ['SHUTOUT_BONUS'] })
    expect(adjustment && 'causes' in adjustment ? adjustment.causes : []).not.toContain('DISTANCE')
    expect(adjustment?.effective).toBe(effectiveCurrentPitcherControl(s))
  })

  it('the same workload with a run allowed is ordinary DISTANCE, and costs far more', () => {
    // One earned run makes him ineligible for the bonus, so the identical
    // out count is charged -2/out instead of -1/out.
    const shutout = currentPitcherControlAdjustment(pitcherWorkload(fixture(), { inning: 10 }))
    const scored = currentPitcherControlAdjustment(pitcherWorkload(fixture(), { inning: 10, earnedRuns: 1 }))
    expect(shutout && 'causes' in shutout ? shutout.causes : []).toEqual(['SHUTOUT_BONUS'])
    expect(scored && 'causes' in scored ? scored.causes : []).toEqual(['DISTANCE'])
    // Same outs, strictly worse Control -- proves the two branches are really different.
    expect(scored.effective).toBeLessThan(shutout.effective)
  })

  it('once the bonus is broken it is no longer SHUTOUT_BONUS', () => {
    const s = pitcherWorkload(fixture(), { inning: 10, earnedRuns: 1 })
    s.pitcherShutoutBonusBrokenAtOuts = { [pitcherInstanceKey('home', 'HOME-8')]: 26 }
    const adjustment = currentPitcherControlAdjustment(s)
    expect(adjustment && 'causes' in adjustment ? adjustment.causes : []).toEqual(['DISTANCE'])
    expect(adjustment?.effective).toBe(effectiveCurrentPitcherControl(s))
  })

  it('reports rest debt alongside the bonus -- an involuntary cause is still real', () => {
    let s = pitcherWorkload(fixture(), { inning: 10 })
    s = attachRestState(s, 'home', { 'HOME-8': { hitterGamesRemaining: 0, pitcherGamesRemaining: 2 } })
    const adjustment = currentPitcherControlAdjustment(s)
    expect(adjustment && 'causes' in adjustment ? adjustment.causes : []).toEqual(['REST', 'SHUTOUT_BONUS'])
    expect(adjustment?.effective).toBe(effectiveCurrentPitcherControl(s))
  })

  it('omits the bonus entirely when the cap leaves it costing nothing', () => {
    // Already at/below 0 from rest debt, the bonus is capped to max(0, base)
    // and takes nothing further -- so it is not a cause of any delta.
    let s = pitcherWorkload(fixture(), { inning: 10 })
    s = attachRestState(s, 'home', { 'HOME-8': { hitterGamesRemaining: 0, pitcherGamesRemaining: 9 } })
    const adjustment = currentPitcherControlAdjustment(s)
    expect(adjustment && 'causes' in adjustment ? adjustment.causes : []).not.toContain('SHUTOUT_BONUS')
    expect(adjustment?.effective).toBe(effectiveCurrentPitcherControl(s))
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
