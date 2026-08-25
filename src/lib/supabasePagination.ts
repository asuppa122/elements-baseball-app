const SUPABASE_PAGE_SIZE = 1000

// Speculative page count fired up front, before the real total is known.
// Deliberately kept close to today's actual scale (~14 pages) rather than a
// large safety margin -- real-measured in-browser that over-guessing is
// actively harmful: firing 20 pages/table (42 requests total incl. count)
// showed real browser-level connection contention pushing individual page
// latency to 2-3.7s, worse than the previous 28-request design. A tight
// guess plus the tested gap-fill logic below (which fetches any additional
// pages once the real count is known) is faster in the common case and only
// pays a small extra round-trip on the rare day the catalog outgrows this
// number -- a performance tuning knob, not a correctness bound.
//
// Also tried going lower (12, deliberately undershooting today's real ~14
// pages to guarantee a smaller initial burst): real-measured to not help --
// the guaranteed extra gap-fill round-trip on every load roughly cancelled
// out any benefit from fewer simultaneous connections (10 cold runs: 4/10
// over a 2s target, vs 3/10 at 15). Left at 15. The remaining tail is real
// connection-level contention/variance under concurrent load, not something
// this constant can tune away.
const INITIAL_PAGE_GUESS = 15

// How many rounds of "fetch whatever's still wrong" to attempt before giving
// up and throwing. Covers both genuine gaps (catalog bigger than the initial
// guess) and transient anomalies (a page that comes back short/wrong despite
// a 200 status -- real-observed once in ~12 high-concurrency runs during
// investigation).
const MAX_RETRY_ROUNDS = 3

type PageFetchResult<T> = {
  data: T[] | null
  error: unknown
}

type CountFetchResult = {
  count: number | null
  error: unknown
}

function expectedLengthForOffset(offset: number, total: number): number {
  const remaining = total - offset
  return remaining <= 0 ? 0 : Math.min(SUPABASE_PAGE_SIZE, remaining)
}

/**
 * Fetches every row matching a query, paginating around Supabase's
 * server-side row cap (this project's instance caps any single request at
 * 1000 rows regardless of requested `limit` -- confirmed empirically).
 *
 * Fires a speculative batch of pages fully in parallel (no blocking count
 * query first) alongside a single lightweight exact-count request. Once the
 * real total is known, verifies every expected page actually came back
 * complete -- gap-filling pages beyond the initial guess and retrying any
 * page whose length doesn't match what it should be. After MAX_RETRY_ROUNDS,
 * throws rather than silently returning incomplete data.
 *
 * `runPage(range)` fetches one page of data (no count needed).
 * `runCount()` fetches just the exact total row count for the same
 * filtered query (e.g. via `.select(col, { count: 'exact', head: true })`).
 */
export async function fetchAllPaginated<T>(
  runPage: (range: {
    from: number
    to: number
  }) => PromiseLike<PageFetchResult<T>>,
  runCount: () => PromiseLike<CountFetchResult>,
): Promise<T[]> {
  const pageData = new Map<number, T[]>()

  async function fetchOffsets(offsets: number[]): Promise<void> {
    const results = await Promise.all(
      offsets.map(async (offset) => {
        const result = await runPage({
          from: offset,
          to: offset + SUPABASE_PAGE_SIZE - 1,
        })
        return { offset, result }
      }),
    )

    for (const { offset, result } of results) {
      if (result.error) {
        // Leave unset -- picked up as "bad" and retried below.
        continue
      }
      pageData.set(offset, (result.data ?? []) as T[])
    }
  }

  const initialOffsets = Array.from(
    { length: INITIAL_PAGE_GUESS },
    (_, index) => index * SUPABASE_PAGE_SIZE,
  )

  // Supabase's query builder is a lazy thenable -- calling runCount() alone
  // does NOT dispatch the request, only awaiting/then-ing it does. Wrapping
  // in Promise.resolve() here forces it to fire immediately, genuinely
  // concurrent with the data pages below, instead of accidentally being
  // deferred until it's awaited later (real bug found during verification:
  // the count request was firing AFTER the entire data-page batch
  // completed, not alongside it, adding a full extra serial round-trip
  // exactly on the runs that looked like unexplained "variance").
  const countPromise = Promise.resolve(runCount())

  await fetchOffsets(initialOffsets)

  const countResult = await countPromise

  if (countResult.error) {
    throw countResult.error
  }

  const total = countResult.count ?? 0
  const expectedPages = Math.ceil(total / SUPABASE_PAGE_SIZE)
  const expectedOffsets = Array.from(
    { length: expectedPages },
    (_, index) => index * SUPABASE_PAGE_SIZE,
  )

  function findBadOffsets(): number[] {
    return expectedOffsets.filter((offset) => {
      const data = pageData.get(offset)
      if (!data) {
        return true
      }
      return data.length !== expectedLengthForOffset(offset, total)
    })
  }

  let round = 0
  while (round < MAX_RETRY_ROUNDS) {
    const badOffsets = findBadOffsets()
    if (badOffsets.length === 0) {
      break
    }
    await fetchOffsets(badOffsets)
    round += 1
  }

  const remainingBadOffsets = findBadOffsets()

  if (remainingBadOffsets.length > 0) {
    throw new Error(
      `fetchAllPaginated: could not fetch complete data after ${MAX_RETRY_ROUNDS} retry rounds. ` +
        `Missing/incomplete offsets: ${remainingBadOffsets.join(', ')}. Expected total rows: ${total}.`,
    )
  }

  const allRows: T[] = []
  for (const offset of expectedOffsets) {
    allRows.push(...(pageData.get(offset) ?? []))
  }

  if (allRows.length !== total) {
    throw new Error(
      `fetchAllPaginated: row count mismatch after retries. Expected ${total}, got ${allRows.length}.`,
    )
  }

  return allRows
}
