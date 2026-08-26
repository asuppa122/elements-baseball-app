import { describe, expect, it } from 'vitest'
import { runCoreGameHarness, runDecisionStressHarness } from '../testHarness'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'

// Real Vitest wrapper around the existing seeded, longer-running
// certification-style playthroughs (previously only reachable manually from
// the private /games/lab game-state page's dev buttons). Same fixture
// already reused for the scenario-harness and data-layer test ports.
//
// Per CLAUDE.md's testing philosophy, full-game CPU simulation is "for
// finding unanticipated interactions... not a certification ritual to run
// by default" -- so this keeps the automated regression check intentionally
// small (1 full game + 25 stress simulations, both well under a second)
// rather than the real button's manual 100/1,000/5,000-game certification
// runs, which stay a deliberate, human-invoked action on that page.
const STRESS_SIMULATIONS = 25

describe('runCoreGameHarness', () => {
  const report = runCoreGameHarness(buildNonGbCoverageFixture(), 1925, 500)

  it('completes a full game', () => {
    expect(report.completed).toBe(true)
  })

  it('records no structural validation errors', () => {
    expect(report.invalidStates).toEqual([])
  })

  it.each(report.invariants)('$name', (invariant) => {
    expect(invariant.passed, invariant.detail).toBe(true)
  })
})

describe('runDecisionStressHarness', () => {
  const report = runDecisionStressHarness(buildNonGbCoverageFixture(), 1925, STRESS_SIMULATIONS, 500)

  it(`completes all ${STRESS_SIMULATIONS} simulations with zero bypasses`, () => {
    expect(report.completed).toBe(STRESS_SIMULATIONS)
    expect(report.failed).toBe(0)
  })

  it('records no structural validation errors across any simulation', () => {
    expect(report.invalidStates).toEqual([])
  })
})
