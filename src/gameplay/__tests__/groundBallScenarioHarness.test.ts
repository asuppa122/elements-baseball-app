import { describe, expect, it } from 'vitest'
import { runGroundBallScenarioMatrix } from '../groundBallScenarioHarness'

// Real Vitest wrapper around the existing deterministic ground-ball harness —
// the scenario logic itself lives entirely in groundBallScenarioHarness.ts.
// The matrix builds its own internal fixtures and ignores its `initial` argument
// (kept only for call-signature compatibility) — same `undefined as never` call
// rulebookCoverage.ts already uses to invoke it.
describe('groundBallScenarioHarness: ground-ball scenario matrix', () => {
  const report = runGroundBallScenarioMatrix(undefined as never)

  it(`ran the full matrix (${report.total} scenarios)`, () => {
    expect(report.total).toBeGreaterThan(0)
  })

  it.each(report.results)('$id — $description', (result) => {
    expect(result.passed, result.detail).toBe(true)
  })
})
