import { describe, expect, it } from 'vitest'
import { runPaMarkerScenarioMatrix } from '../paMarkerScenarioHarness'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'

// Real Vitest wrapper around the plate-appearance-marker regression harness --
// the scenario logic itself lives entirely in paMarkerScenarioHarness.ts. Same
// fixture already used to drive the Non-GB matrix (rulebookCoverage.ts).
describe('paMarkerScenarioHarness: plate-appearance marker matrix', () => {
  const report = runPaMarkerScenarioMatrix(buildNonGbCoverageFixture())

  it(`ran the full matrix (${report.total} scenarios)`, () => {
    expect(report.total).toBeGreaterThan(0)
  })

  it.each(report.results)('$id — $description', (result) => {
    expect(result.passed, result.detail).toBe(true)
  })
})
