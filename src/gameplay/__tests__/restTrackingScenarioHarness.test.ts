import { describe, expect, it } from 'vitest'
import { runRestTrackingScenarioMatrix } from '../restTrackingScenarioHarness'

// Real Vitest wrapper around the persistent Ftg/Rm rest-tracking harness --
// the scenario logic itself lives entirely in restTrackingScenarioHarness.ts.
describe('restTrackingScenarioHarness: rest tracking scenario matrix', () => {
  const report = runRestTrackingScenarioMatrix()

  it(`ran the full matrix (${report.total} scenarios)`, () => {
    expect(report.total).toBeGreaterThan(0)
  })

  it.each(report.results)('$id — $description', (result) => {
    expect(result.passed, result.detail).toBe(true)
  })
})
