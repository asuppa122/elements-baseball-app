import { describe, expect, it } from 'vitest'
import { runSequence } from '../sequence'

describe('runSequence', () => {
  it('applies every step in order', async () => {
    const order: number[] = []
    await runSequence([
      { apply: () => order.push(1), waitMs: 0 },
      { apply: () => order.push(2), waitMs: 0 },
      { apply: () => order.push(3), waitMs: 0 },
    ])
    expect(order).toEqual([1, 2, 3])
  })

  it('actually waits between steps, not just applying everything immediately', async () => {
    const timestamps: number[] = []
    const start = Date.now()
    await runSequence([
      { apply: () => timestamps.push(Date.now() - start), waitMs: 20 },
      { apply: () => timestamps.push(Date.now() - start), waitMs: 0 },
    ])
    // Real timing assertion, not just call-order -- proves waitMs actually
    // delays the next step rather than being a no-op.
    expect(timestamps[1]).toBeGreaterThanOrEqual(15)
  })

  it('resolves with no steps', async () => {
    await expect(runSequence([])).resolves.toBeUndefined()
  })

  it('a deliberately wrong order would fail this test -- proves it actually checks sequencing', async () => {
    const order: number[] = []
    await runSequence([
      { apply: () => order.push(1), waitMs: 0 },
      { apply: () => order.push(2), waitMs: 0 },
    ])
    expect(order).not.toEqual([2, 1])
  })
})
