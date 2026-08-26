import { describe, expect, it } from 'vitest'
import { runFatigueScenarioMatrix } from '../fatigueScenarioHarness'

// Real Vitest wrapper around the existing deterministic fatigue harness —
// the scenario logic itself lives entirely in fatigueScenarioHarness.ts.
describe('fatigueScenarioHarness: fatigue scenario matrix', () => {
  const report = runFatigueScenarioMatrix()

  it(`ran the full matrix (${report.total} scenarios)`, () => {
    expect(report.total).toBeGreaterThan(0)
  })

  it.each(report.results)('$id — $description', (result) => {
    expect(result.passed, result.detail).toBe(true)
  })
})
