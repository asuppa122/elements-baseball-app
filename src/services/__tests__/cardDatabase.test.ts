import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CardImageRow, CardRow } from '../../types/card'

// A minimal fluent mock of the Supabase query builder, shaped only for the
// exact call patterns cardDatabase.ts actually uses (select/gte/eq/order/
// range/limit/maybeSingle, plus the builder itself being awaitable). Built
// via vi.hoisted so it's available inside the hoisted vi.mock factory below.
const { state, resetState, supabase } = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const state = {
    cards: [] as Row[],
    cardImages: [] as Row[],
    fromCallCount: 0,
    shouldErrorOnce: false,
  }

  function resetState() {
    state.cards = []
    state.cardImages = []
    state.fromCallCount = 0
    state.shouldErrorOnce = false
  }

  function tableBuilder(table: 'cards' | 'card_images') {
    state.fromCallCount += 1
    let mode: 'count' | 'data' | 'single' = 'data'
    let eqValue: string | undefined
    let rangeFrom = 0
    let rangeTo = 0

    const rows = () => (table === 'cards' ? state.cards : state.cardImages)

    function resolveResult(): { data?: unknown; error: unknown; count?: number } {
      if (state.shouldErrorOnce) {
        state.shouldErrorOnce = false
        return { data: null, error: new Error('simulated fetch failure') }
      }
      if (mode === 'count') return { count: rows().length, error: null }
      if (mode === 'single') {
        const row = rows().find((r) => r.card_key === eqValue) ?? null
        return { data: row, error: null }
      }
      return { data: rows().slice(rangeFrom, rangeTo + 1), error: null }
    }

    const builder = {
      select: (_cols: string, opts?: { count?: string }) => {
        if (opts?.count) mode = 'count'
        return builder
      },
      gte: () => builder,
      eq: (_col: string, value: string) => {
        eqValue = value
        return builder
      },
      order: () => builder,
      range: (from: number, to: number) => {
        rangeFrom = from
        rangeTo = to
        return builder
      },
      limit: () => builder,
      maybeSingle: () => {
        mode = 'single'
        return Promise.resolve(resolveResult())
      },
      then: (onFulfilled: (r: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(resolveResult()).then(onFulfilled, onRejected),
    }

    return builder
  }

  return {
    state,
    resetState,
    supabase: { from: (table: 'cards' | 'card_images') => tableBuilder(table) },
  }
})

vi.mock('../../lib/supabase', () => ({ supabase }))

function makeCardRow(overrides: Partial<CardRow> = {}): CardRow {
  return {
    card_key: 'KEY', all_number: null, card_number: null, player_name: 'Player',
    league: null, team_name: null, ownership: null,
    hitter_bats: null, hitter_fatigue: null, hitter_year: null, hitter_team_code: null,
    hitter_on_base: null, hitter_outs: null, hitter_baserunning: null, hitter_stolen_base: null,
    defense_c: null, defense_1b: null, defense_2b: null, defense_3b: null,
    defense_ss: null, defense_lf: null, defense_cf: null, defense_rf: null,
    hitter_pu: null, hitter_k: null, hitter_gb: null, hitter_fb: null, hitter_bb: null,
    hitter_1b: null, hitter_1b_plus: null, hitter_2b: null, hitter_3b: null, hitter_hr: null,
    hitter_points: 0,
    pitcher_arm: null, pitcher_fatigue: null, pitcher_year: null, pitcher_team_code: null,
    pitcher_control: null, pitcher_outs: null, pitcher_ip: null,
    pitcher_pu: null, pitcher_k: null, pitcher_gb: null, pitcher_fb: null, pitcher_bb: null,
    pitcher_1b: null, pitcher_2b: null, pitcher_3b: null, pitcher_hr: null,
    source_yes_field: null,
    ...overrides,
  }
}

function makeImageRow(overrides: Partial<CardImageRow> = {}): CardImageRow {
  return { card_key: 'KEY', image_url: null, ...overrides }
}

beforeEach(() => {
  resetState()
  vi.resetModules()
})

describe('loadSeasonCards', () => {
  it('merges each card with its normalized image url by card_key', async () => {
    state.cards = [makeCardRow({ card_key: 'A' }), makeCardRow({ card_key: 'B' })]
    state.cardImages = [makeImageRow({ card_key: 'A', image_url: 's://example.com/a.png' })]

    const { loadSeasonCards } = await import('../cardDatabase')
    const result = await loadSeasonCards()

    const cardA = result.find((c) => c.card_key === 'A')
    const cardB = result.find((c) => c.card_key === 'B')
    expect(cardA?.image_url).toBe('https://example.com/a.png')
    expect(cardB?.image_url).toBeNull()
  })

  it('caches the result -- a second call does not refetch from Supabase', async () => {
    state.cards = [makeCardRow({ card_key: 'A' })]
    const { loadSeasonCards } = await import('../cardDatabase')

    await loadSeasonCards()
    const countAfterFirst = state.fromCallCount
    await loadSeasonCards()

    expect(state.fromCallCount).toBe(countAfterFirst)
  })

  it('does not cache a failed load -- the next call retries from scratch', async () => {
    state.cards = [makeCardRow({ card_key: 'A' })]
    state.shouldErrorOnce = true
    const { loadSeasonCards } = await import('../cardDatabase')

    await expect(loadSeasonCards()).rejects.toThrow()

    const result = await loadSeasonCards()
    expect(result).toHaveLength(1)
  })

  it('dedupes concurrent calls into a single in-flight fetch', async () => {
    state.cards = [makeCardRow({ card_key: 'A' })]
    const { loadSeasonCards } = await import('../cardDatabase')

    const [first, second] = await Promise.all([loadSeasonCards(), loadSeasonCards()])

    expect(first).toBe(second)
  })
})

describe('loadCardByKey', () => {
  it('merges a single card with its normalized image url', async () => {
    state.cards = [makeCardRow({ card_key: 'A' })]
    state.cardImages = [makeImageRow({ card_key: 'A', image_url: 's://example.com/a.png' })]

    const { loadCardByKey } = await import('../cardDatabase')
    const result = await loadCardByKey('A')

    expect(result?.image_url).toBe('https://example.com/a.png')
  })

  it('returns null when the card does not exist, without throwing', async () => {
    state.cards = []
    const { loadCardByKey } = await import('../cardDatabase')

    const result = await loadCardByKey('MISSING')

    expect(result).toBeNull()
  })
})
