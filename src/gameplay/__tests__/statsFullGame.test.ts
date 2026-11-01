import { describe, expect, it } from 'vitest'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'
import { startPlayLog } from '../playLog'
import { runDecisionStressHarness } from '../testHarness'
import { reconcileBoxScore } from '../stats/reconcile'

/**
 * Whole games under rules v2, played by the rules bot through every decision
 * type, each finished game's box score reconciled against its final state
 * (runs, hits, PA = BF, outs per pitcher, line-up cursor, decisions). Kept
 * small, like testHarness.test.ts: it looks for interactions the
 * deterministic scenarios didn't anticipate, not frequencies.
 */
describe('recorded games reconcile with their final state', () => {
  const v2 = startPlayLog({ ...buildNonGbCoverageFixture(), rulesVersion: 2 })
  const report = runDecisionStressHarness(v2, 20261101, 60, 500, reconcileBoxScore)

  it('every simulated game completes', () => {
    expect(report.completed).toBe(60)
  })

  it('no structural or box-score reconciliation issue', () => {
    expect(report.invalidStates).toEqual([])
  })
})
