import { describe, expect, it } from 'vitest'
import { pregameEffectiveControl, pregameEffectiveOnBase } from '../pregameFatigueDisplay'
import { effectiveHitterOnBase, effectivePitcherControl } from '../fatigueEngine'
import type { GameCardSnapshot } from '../types'

// Real regression coverage for the pregame fatigue-adjusted-rating display,
// used by GameplayPregamePage.tsx's Starting Pitcher and Default Batter
// Declarations sections. Pulled into this standalone module specifically so
// it stays testable in Vitest's 'node' environment -- GameplayPregamePage.tsx
// transitively imports src/lib/supabase.ts, which touches window.localStorage
// at module scope and throws immediately outside a real browser/jsdom.
// /games/lab/:gameId/pregame is also a private, allowlist-gated, Discord-
// authenticated route with no demo equivalent, so this session has no way to
// load it live and screenshot it directly either way -- this is the real
// verification available, on top of manual code review confirming these call
// the exact same already-tested fatigueEngine.ts formulas restStateWiring.
// test.ts already verified against real inputs.

function card(overrides: Partial<GameCardSnapshot> = {}): GameCardSnapshot {
  return {
    cardKey: 'TEST-1', playerName: 'Test Player', imageUrl: null, year: 2025, points: 100,
    hitter: { bats: 'R', onBase: 12, fatigue: 5, baserunning: 10, stolenBase: 10, chart: { PU: null, K: null, GB: null, FB: null, BB: null, '1B': null, '1B+': null, '2B': null, '3B': null, HR: null } },
    pitcher: { arm: 'R', control: 6, fatigue: 4, ip: 5, chart: { PU: null, K: null, GB: null, FB: null, BB: null, '1B': null, '2B': null, '3B': null, HR: null } },
    defense: {},
    ...overrides,
  }
}

describe('pregameEffectiveOnBase', () => {
  it('returns null (nothing to show) for a fully rested hitter -- no debt at all', () => {
    expect(pregameEffectiveOnBase(card(), {})).toBeNull()
  })

  it('returns null when the stored entry exists but is exactly 0', () => {
    expect(pregameEffectiveOnBase(card(), { 'TEST-1': { hitterGamesRemaining: 0 } })).toBeNull()
  })

  it('returns the real fatigueEngine.ts effective value for a hitter carrying rest debt', () => {
    const c = card()
    const result = pregameEffectiveOnBase(c, { 'TEST-1': { hitterGamesRemaining: 3 } })
    expect(result).toBe(effectiveHitterOnBase(12, 3, false))
    expect(result).toBe(9) // concrete, not just "matches the formula" -- 12 - 3 = 9
  })

  it('floors at On Base 5, same as the underlying formula, even with heavy debt', () => {
    const result = pregameEffectiveOnBase(card(), { 'TEST-1': { hitterGamesRemaining: 20 } })
    expect(result).toBe(5)
  })

  it('returns null for a card with no hitter chart at all (pitcher-only card)', () => {
    const c = card({ hitter: { ...card().hitter, onBase: null } })
    expect(pregameEffectiveOnBase(c, { 'TEST-1': { hitterGamesRemaining: 5 } })).toBeNull()
  })

  it('a different card_key\'s debt does not leak onto this card', () => {
    expect(pregameEffectiveOnBase(card(), { 'OTHER-CARD': { hitterGamesRemaining: 9 } })).toBeNull()
  })
})

describe('pregameEffectiveControl', () => {
  it('returns null for a fully rested pitcher', () => {
    expect(pregameEffectiveControl(card(), {})).toBeNull()
  })

  it('returns the real fatigueEngine.ts effective value for a pitcher carrying rest debt', () => {
    const c = card()
    const result = pregameEffectiveControl(c, { 'TEST-1': { pitcherGamesRemaining: 2 } })
    expect(result).toBe(effectivePitcherControl({ printedControl: 6, gamesFromRested: 2, cardIp: 5, outsRecorded: 0, earnedRunsAllowed: 0 }))
    expect(result).toBe(4) // concrete -- 6 - 2 = 4, no in-game penalties applied pregame
  })

  it('floors at Control -5, same as the underlying formula', () => {
    const result = pregameEffectiveControl(card(), { 'TEST-1': { pitcherGamesRemaining: 20 } })
    expect(result).toBe(-5)
  })

  it('returns null for a card with no pitcher chart at all (hitter-only card)', () => {
    const c = card({ pitcher: { ...card().pitcher, control: null } })
    expect(pregameEffectiveControl(c, { 'TEST-1': { pitcherGamesRemaining: 5 } })).toBeNull()
  })
})
