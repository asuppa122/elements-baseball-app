import { describe, expect, it } from 'vitest'
import { attachRestState, effectiveCurrentHitterOnBase, effectiveCurrentPitcherControl } from '../engine'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'
import { effectiveHitterOnBase, effectivePitcherControl } from '../fatigueEngine'
import type { GameState } from '../types'

// Confirms fatigueEngine.ts's already-tested formulas are genuinely untouched
// by this wiring change -- only their real inputs change, not the math
// itself. Threading gamesFromRested through from state.restState is entirely
// new plumbing in engine.ts; fatigueEngine.ts is not modified at all.
describe('restState wiring: real inputs feed the unmodified fatigueEngine.ts formulas', () => {
  function fixture(): GameState {
    const s = structuredClone(buildNonGbCoverageFixture())
    s.half = 'top' // away bats, home pitches -- matches plateAppearance below
    s.plateAppearance = { ...s.plateAppearance, batterCardKey: 'AWAY-0', pitcherCardKey: 'HOME-8' }
    return s
  }

  it('with no restState attached, gamesFromRested is 0 -- unchanged prior behavior', () => {
    const s = fixture()
    const batterCard = s.pregame.away.roster!.cards['AWAY-0']
    const pitcherCard = s.pregame.home.roster!.cards['HOME-8']
    expect(effectiveCurrentHitterOnBase(s)).toBe(effectiveHitterOnBase(batterCard.hitter.onBase, 0, false))
    expect(effectiveCurrentPitcherControl(s)).toBe(
      effectivePitcherControl({ printedControl: pitcherCard.pitcher.control, gamesFromRested: 0, cardIp: pitcherCard.pitcher.ip, outsRecorded: 0, earnedRunsAllowed: 0 }),
    )
  })

  it('attachRestState threads a real hitter rest debt into the effective On Base calculation', () => {
    let s = fixture()
    const batterCard = s.pregame.away.roster!.cards['AWAY-0']
    s = attachRestState(s, 'away', { 'AWAY-0': { hitterGamesRemaining: 2, pitcherGamesRemaining: 0 } })
    const expected = effectiveHitterOnBase(batterCard.hitter.onBase, 2, false)
    expect(effectiveCurrentHitterOnBase(s)).toBe(expected)
    // Sanity: this must actually be lower than the unfatigued value, or the wiring silently did nothing.
    expect(effectiveCurrentHitterOnBase(s)).toBeLessThan(batterCard.hitter.onBase!)
  })

  it('attachRestState threads a real pitcher rest debt into the effective Control calculation', () => {
    let s = fixture()
    const pitcherCard = s.pregame.home.roster!.cards['HOME-8']
    s = attachRestState(s, 'home', { 'HOME-8': { hitterGamesRemaining: 0, pitcherGamesRemaining: 3 } })
    const expected = effectivePitcherControl({ printedControl: pitcherCard.pitcher.control, gamesFromRested: 3, cardIp: pitcherCard.pitcher.ip, outsRecorded: 0, earnedRunsAllowed: 0 })
    expect(effectiveCurrentPitcherControl(s)).toBe(expected)
    expect(effectiveCurrentPitcherControl(s)).toBeLessThan(pitcherCard.pitcher.control!)
  })

  it('a card_key missing from the attached restState defaults to 0, not a crash or a stale value', () => {
    let s = fixture()
    const batterCard = s.pregame.away.roster!.cards['AWAY-0']
    // Attach rest state for a different card entirely -- AWAY-0 itself has no entry.
    s = attachRestState(s, 'away', { 'AWAY-1': { hitterGamesRemaining: 9, pitcherGamesRemaining: 0 } })
    expect(effectiveCurrentHitterOnBase(s)).toBe(effectiveHitterOnBase(batterCard.hitter.onBase, 0, false))
  })

  it('attachRestState scopes strictly to the given side -- attaching away does not affect home\'s pitcher', () => {
    let s = fixture()
    const pitcherCard = s.pregame.home.roster!.cards['HOME-8']
    s = attachRestState(s, 'away', { 'HOME-8': { hitterGamesRemaining: 0, pitcherGamesRemaining: 9 } })
    // HOME-8 under the 'away' key must not leak into the home pitcher's own lookup.
    expect(effectiveCurrentPitcherControl(s)).toBe(
      effectivePitcherControl({ printedControl: pitcherCard.pitcher.control, gamesFromRested: 0, cardIp: pitcherCard.pitcher.ip, outsRecorded: 0, earnedRunsAllowed: 0 }),
    )
  })

  it('attaching restState for one side preserves whatever was already attached for the other side', () => {
    let s = fixture()
    s = attachRestState(s, 'away', { 'AWAY-0': { hitterGamesRemaining: 2, pitcherGamesRemaining: 0 } })
    s = attachRestState(s, 'home', { 'HOME-8': { hitterGamesRemaining: 0, pitcherGamesRemaining: 3 } })
    expect(s.restState?.away?.['AWAY-0']?.hitterGamesRemaining).toBe(2)
    expect(s.restState?.home?.['HOME-8']?.pitcherGamesRemaining).toBe(3)
  })
})
