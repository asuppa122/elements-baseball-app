import { describe, expect, it } from 'vitest'
import { runGameBoundaryScenarioMatrix } from '../gameBoundaryScenarioHarness'

// Real Vitest wrapper around the existing deterministic game/season-boundary
// harness — the scenario logic itself lives entirely in gameBoundaryScenarioHarness.ts.
describe('gameBoundaryScenarioHarness: game/season boundary scenario matrix', () => {
  const report = runGameBoundaryScenarioMatrix()

  it(`ran the full matrix (${report.total} scenarios)`, () => {
    expect(report.total).toBeGreaterThan(0)
  })

  it.each(report.results)('$id — $description', (result) => {
    expect(result.passed, result.detail).toBe(true)
  })
})
