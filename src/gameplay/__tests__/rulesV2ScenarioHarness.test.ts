import { describe, expect, it } from 'vitest'
import { runRulesV2ScenarioMatrix } from '../rulesV2ScenarioHarness'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'

// Thin wrapper: the scenarios live in rulesV2ScenarioHarness.ts.
describe('rules v2 scenario matrix (decisions of 2026-11-01)', () => {
  const report = runRulesV2ScenarioMatrix(buildNonGbCoverageFixture())

  it(`ran the full matrix (${report.total} scenarios)`, () => {
    expect(report.total).toBeGreaterThan(0)
  })

  it.each(report.results)('$id — $description', (result) => {
    expect(result.passed, result.detail).toBe(true)
  })
})
