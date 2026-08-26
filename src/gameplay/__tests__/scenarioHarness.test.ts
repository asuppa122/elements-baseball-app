import { describe, expect, it } from 'vitest'
import { runNonGbScenarioMatrix } from '../scenarioHarness'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'

// Real Vitest wrapper around the existing deterministic scenario harness —
// the scenario logic itself lives entirely in scenarioHarness.ts and is not
// duplicated or reimplemented here. The fixture is the same one already used
// to drive this matrix from rulebookCoverage.ts / the /games/lab/verification page.
describe('scenarioHarness: non-GB scenario matrix', () => {
  const report = runNonGbScenarioMatrix(buildNonGbCoverageFixture())

  it(`ran the full matrix (${report.total} scenarios)`, () => {
    expect(report.total).toBeGreaterThan(0)
  })

  it.each(report.results)('$id — $description', (result) => {
    expect(result.passed, result.detail).toBe(true)
  })
})
