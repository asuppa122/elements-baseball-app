import { describe, expect, it } from 'vitest'
import { fetchAllPaginated } from '../supabasePagination'

// Real Vitest port of the standalone integrity script written during this
// week's pagination/caching fix (originally run ad hoc via `node
// test-pagination-integrity.ts` against a copy of the module). Same 5
// scenarios, same real-observed fault patterns, now wired into `npm test`
// instead of living outside the repo. Logic is unchanged -- only the
// assert()/console.log harness became real expect() calls.

type Row = { id: number }

function makeRows(offset: number, count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({ id: offset + i }))
}

describe('fetchAllPaginated', () => {
  it('returns every row in order for a clean, single-round-trip fetch (baseline)', async () => {
    const TOTAL = 2500

    const result = await fetchAllPaginated<Row>(
      async ({ from }) => ({ data: makeRows(from, Math.min(1000, Math.max(0, TOTAL - from))), error: null }),
      async () => ({ count: TOTAL, error: null }),
    )

    expect(result).toHaveLength(TOTAL)
    expect(result[0].id).toBe(0)
    expect(result[TOTAL - 1].id).toBe(TOTAL - 1)
  })

  it('retries and corrects a page that comes back short on the first attempt (the real observed anomaly)', async () => {
    // Real catalog scale; a page that returns short despite a success status
    // was observed once in ~12 high-concurrency runs during the original
    // pagination investigation. This forces that exact anomaly.
    const TOTAL = 13573
    let attemptsForOffset9000 = 0

    const result = await fetchAllPaginated<Row>(
      async ({ from }) => {
        const fullLength = Math.min(1000, Math.max(0, TOTAL - from))
        if (from === 9000) {
          attemptsForOffset9000 += 1
          if (attemptsForOffset9000 === 1) {
            // Only 400 of the expected 1000 rows came back on the first try.
            return { data: makeRows(from, 400), error: null }
          }
        }
        return { data: makeRows(from, fullLength), error: null }
      },
      async () => ({ count: TOTAL, error: null }),
    )

    expect(attemptsForOffset9000).toBeGreaterThanOrEqual(2)
    expect(result).toHaveLength(TOTAL)
    expect(result.map((r) => r.id)).toEqual(Array.from({ length: TOTAL }, (_, i) => i))
  })

  it('gap-fills pages beyond the initial speculative page guess', async () => {
    // 26 pages -- comfortably past the module's initial speculative guess
    // (currently 15 pages; kept unpinned here so this test doesn't need
    // updating if that tuning constant ever changes again).
    const TOTAL = 25500
    const fetchedOffsets = new Set<number>()

    const result = await fetchAllPaginated<Row>(
      async ({ from }) => {
        fetchedOffsets.add(from)
        return { data: makeRows(from, Math.min(1000, Math.max(0, TOTAL - from))), error: null }
      },
      async () => ({ count: TOTAL, error: null }),
    )

    expect(fetchedOffsets.has(20000)).toBe(true)
    expect(result).toHaveLength(TOTAL)
  })

  it('throws rather than silently returning incomplete data when a page never succeeds', async () => {
    const TOTAL = 13573

    const call = fetchAllPaginated<Row>(
      async ({ from }) => {
        if (from === 5000) {
          // Permanently broken, no matter how many times it's retried.
          return { data: makeRows(from, 3), error: null }
        }
        return { data: makeRows(from, Math.min(1000, Math.max(0, TOTAL - from))), error: null }
      },
      async () => ({ count: TOTAL, error: null }),
    )

    await expect(call).rejects.toThrow(/5000/)
  })

  it('retries a page that returns a Supabase-style error object', async () => {
    const TOTAL = 3000
    let attempts = 0

    const result = await fetchAllPaginated<Row>(
      async ({ from }) => {
        if (from === 1000) {
          attempts += 1
          if (attempts === 1) {
            return { data: null, error: { message: 'simulated transient error' } }
          }
        }
        return { data: makeRows(from, Math.min(1000, Math.max(0, TOTAL - from))), error: null }
      },
      async () => ({ count: TOTAL, error: null }),
    )

    expect(attempts).toBe(2)
    expect(result).toHaveLength(TOTAL)
  })
})
