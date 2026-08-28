import { describe, expect, it } from 'vitest'
import { defensiveOutsRecorded } from '../engine'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'
import type { GameState, HalfInning } from '../types'

// Home defends top halves, away defends bottom halves. Every caller before the
// post-game summary asked only about the side fielding at that moment, which
// hid a 3-out undercount for home during any bottom half.

const at = (inning: number, half: HalfInning, outs: 0 | 1 | 2 | 3): GameState => ({
  ...buildNonGbCoverageFixture(), inning, half, outs,
})

describe('defensiveOutsRecorded', () => {
  it('counts the outs a side has recorded in a half it is currently defending', () => {
    expect(defensiveOutsRecorded(at(5, 'top', 2), 'home')).toBe(14)    // tops 1-4 + 2
    expect(defensiveOutsRecorded(at(5, 'bottom', 1), 'away')).toBe(13) // bottoms 1-4 + 1
  })

  it('credits home the top half it already finished when the bottom half is in progress', () => {
    // Regression: this returned 12 (tops 1-4 only), losing the completed 5th.
    expect(defensiveOutsRecorded(at(5, 'bottom', 0), 'home')).toBe(15)
    expect(defensiveOutsRecorded(at(5, 'bottom', 2), 'home')).toBe(15) // away's outs are not home's
  })

  it('does not credit away a bottom half that has not started', () => {
    expect(defensiveOutsRecorded(at(5, 'top', 2), 'away')).toBe(12)
  })

  it('reads a completed walk-off correctly: home threw 9 full innings, away did not', () => {
    // completeGame() freezes inning/half/outs as they stood, so the final state
    // of a bottom-9th walk-off has fewer than 3 outs in the last half.
    const walkoff = at(9, 'bottom', 1)
    expect(defensiveOutsRecorded(walkoff, 'home')).toBe(27)
    expect(defensiveOutsRecorded(walkoff, 'away')).toBe(25)
  })

  it('reads a completed regulation home win the same way', () => {
    const final = at(9, 'bottom', 3)
    expect(defensiveOutsRecorded(final, 'home')).toBe(27)
    expect(defensiveOutsRecorded(final, 'away')).toBe(27)
  })

  it('is unchanged for the fielding side, which is all any existing caller asks', () => {
    for (let inning = 1; inning <= 12; inning += 1) {
      for (const half of ['top', 'bottom'] as HalfInning[]) {
        for (const outs of [0, 1, 2, 3] as const) {
          const fielding = half === 'top' ? 'home' : 'away'
          expect(defensiveOutsRecorded(at(inning, half, outs), fielding)).toBe((inning - 1) * 3 + outs)
        }
      }
    }
  })
})
