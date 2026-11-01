import { describe, expect, it } from 'vitest'
import { runStatsScenarioMatrix } from '../stats/statsScenarioHarness'

// Thin wrapper: the scenarios live in stats/statsScenarioHarness.ts.
describe('statistics and pitcher decisions', () => {
  const report = runStatsScenarioMatrix()

  it(`ran the full matrix (${report.total} scenarios)`, () => {
    expect(report.total).toBeGreaterThan(0)
  })

  it.each(report.results)('$id — $description', (result) => {
    expect(result.passed, result.detail).toBe(true)
  })
})
