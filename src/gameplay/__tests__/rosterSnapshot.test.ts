import { describe, expect, it } from 'vitest'
import { createGameRosterSnapshot, validateRosterForGame, type SavedRosterForGame } from '../rosterSnapshot'
import { ACTIVE_SEASON_CONFIG } from '../seasonConfig'
import type { ActiveSeasonConfiguration } from '../seasonConfig'
import { makeCard } from '../../testUtils/cardFixtures'

// A small, legible config independent of the real active season, so these
// tests keep working regardless of what the league's real roster size/point
// cap happen to be. A separate end-to-end test below exercises the real
// ACTIVE_SEASON_CONFIG directly.
// Real active-season year is whatever ACTIVE_SEASON_CONFIG.mlbYear is (1925
// as of this writing) -- unrelated to testConfig.mlbYear above, since
// isSeasonEligibleCard() always checks against the real app-wide season, not
// the configuration passed into validateRosterForGame. Fixtures below use
// source_yes_field: 'yes' to mark a card season-eligible regardless of year,
// so these tests don't silently break if the league's active season changes.
const testConfig: ActiveSeasonConfiguration = {
  seasonId: 'test',
  seasonLabel: 'Test Season',
  blueprintLabel: 'Test',
  mlbYear: 2025,
  rosterSize: 2,
  pointCap: 300,
  useDh: false,
  requireSeasonEligibleCards: true,
  timelineRules: { automaticExtraInningRunner: false, rosterEraBaseline: '2020-plus' },
}

function buildRoster(overrides: Partial<SavedRosterForGame> = {}): SavedRosterForGame {
  return {
    id: 'roster-1',
    name: 'Test Roster',
    useDh: false,
    playerCount: 2,
    totalPoints: 100,
    rosterState: { assigned: { slotA: 'A', slotB: 'B' } },
    ...overrides,
  }
}

describe('validateRosterForGame', () => {
  it('flags a roster with the wrong unique player count', () => {
    const cardsByKey = new Map([
      ['A', makeCard({ card_key: 'A', hitter_year: 2025, source_yes_field: 'yes', hitter_points: 50 })],
    ])
    const roster = buildRoster({ rosterState: { assigned: { slotA: 'A' } } })

    const result = validateRosterForGame(roster, cardsByKey, testConfig)

    expect(result.eligible).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'ROSTER_SIZE' }),
    )
  })

  it('counts duplicate assignments to the same card once for roster size', () => {
    const cardsByKey = new Map([
      ['A', makeCard({ card_key: 'A', hitter_year: 2025, source_yes_field: 'yes', hitter_points: 50 })],
      ['B', makeCard({ card_key: 'B', hitter_year: 2025, source_yes_field: 'yes', hitter_points: 50 })],
    ])
    // Three slots, but only two unique card keys -- must satisfy rosterSize 2.
    const roster = buildRoster({ rosterState: { assigned: { slotA: 'A', slotB: 'B', slotC: 'A' } } })

    const result = validateRosterForGame(roster, cardsByKey, testConfig)

    expect(result.issues.filter((i) => i.code === 'ROSTER_SIZE')).toHaveLength(0)
  })

  it('recalculates points from the real cards rather than trusting a stale stored total', () => {
    const cardsByKey = new Map([
      ['A', makeCard({ card_key: 'A', hitter_year: 2025, source_yes_field: 'yes', hitter_points: 250 })],
      ['B', makeCard({ card_key: 'B', hitter_year: 2025, source_yes_field: 'yes', hitter_points: 250 })],
    ])
    // Stored totalPoints understates the real 500 -- validator must not trust it.
    const roster = buildRoster({ totalPoints: 10 })

    const result = validateRosterForGame(roster, cardsByKey, testConfig)

    expect(result.eligible).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'POINT_CAP' }),
    )
  })

  it('flags a DH mismatch against the active configuration', () => {
    const cardsByKey = new Map([
      ['A', makeCard({ card_key: 'A', hitter_year: 2025, source_yes_field: 'yes', hitter_points: 50 })],
      ['B', makeCard({ card_key: 'B', hitter_year: 2025, source_yes_field: 'yes', hitter_points: 50 })],
    ])
    const roster = buildRoster({ useDh: true }) // testConfig.useDh is false

    const result = validateRosterForGame(roster, cardsByKey, testConfig)

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'DH_CONFIGURATION' }),
    )
  })

  it('flags an assigned card_key that does not exist in the card database', () => {
    const cardsByKey = new Map([
      ['A', makeCard({ card_key: 'A', hitter_year: 2025, source_yes_field: 'yes', hitter_points: 50 })],
    ])
    const roster = buildRoster({ rosterState: { assigned: { slotA: 'A', slotB: 'GHOST' } } })

    const result = validateRosterForGame(roster, cardsByKey, testConfig)

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'MISSING_CARD', cardKey: 'GHOST' }),
    )
  })

  it('flags a season-ineligible card when the configuration requires season eligibility', () => {
    const cardsByKey = new Map([
      ['A', makeCard({ card_key: 'A', hitter_year: 2025, source_yes_field: 'yes', hitter_points: 50 })],
      // Wrong year for the real active season and no source_yes_field override.
      ['B', makeCard({ card_key: 'B', hitter_year: 1899, hitter_points: 50, source_yes_field: null })],
    ])
    const roster = buildRoster()

    const result = validateRosterForGame(roster, cardsByKey, testConfig)

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'SEASON_INELIGIBLE_CARD', cardKey: 'B' }),
    )
  })

  it('reports eligible with no issues for a fully valid roster', () => {
    const cardsByKey = new Map([
      ['A', makeCard({ card_key: 'A', hitter_year: 2025, source_yes_field: 'yes', hitter_points: 50 })],
      ['B', makeCard({ card_key: 'B', hitter_year: 2025, source_yes_field: 'yes', hitter_points: 50 })],
    ])
    const roster = buildRoster()

    const result = validateRosterForGame(roster, cardsByKey, testConfig)

    expect(result).toEqual({ eligible: true, issues: [] })
  })
})

describe('createGameRosterSnapshot', () => {
  it('throws with the aggregated issue messages when the roster is not eligible', () => {
    const cardsByKey = new Map<string, ReturnType<typeof makeCard>>()
    const roster = buildRoster({ rosterState: { assigned: { slotA: 'A' } } })

    expect(() => createGameRosterSnapshot(roster, cardsByKey, testConfig)).toThrow(/roster has 1 unique/i)
  })

  it('freezes a valid roster into a snapshot with real per-card data, not just references', () => {
    const cardA = makeCard({
      card_key: 'A',
      player_name: 'Player A',
      hitter_year: 2025, source_yes_field: 'yes',
      hitter_points: 120,
      defense_c: 3,
      defense_1b: null,
    })
    const cardB = makeCard({ card_key: 'B', player_name: 'Player B', hitter_year: 2025, source_yes_field: 'yes', hitter_points: 80 })
    const cardsByKey = new Map([
      ['A', cardA],
      ['B', cardB],
    ])
    const roster = buildRoster({ id: 'roster-42', name: 'Snapshot Test' })

    const snapshot = createGameRosterSnapshot(roster, cardsByKey, testConfig, '2026-01-01T00:00:00.000Z')

    expect(snapshot.sourceLineupId).toBe('roster-42')
    expect(snapshot.playerCount).toBe(2)
    expect(snapshot.totalPoints).toBe(200)
    expect(snapshot.capturedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(snapshot.cards.A.playerName).toBe('Player A')
    expect(snapshot.cards.A.points).toBe(120)
    // Only non-null defensive ratings should be present on the snapshot.
    expect(snapshot.cards.A.defense).toEqual({ C: 3 })
  })

  it('deep-clones assignments so mutating the original roster does not affect the snapshot', () => {
    const cardsByKey = new Map([
      ['A', makeCard({ card_key: 'A', hitter_year: 2025, source_yes_field: 'yes', hitter_points: 50 })],
      ['B', makeCard({ card_key: 'B', hitter_year: 2025, source_yes_field: 'yes', hitter_points: 50 })],
    ])
    const assigned: Record<string, string> = { slotA: 'A', slotB: 'B' }
    const roster = buildRoster({ rosterState: { assigned } })

    const snapshot = createGameRosterSnapshot(roster, cardsByKey, testConfig)
    assigned.slotA = 'MUTATED'

    expect(snapshot.assignments.slotA).toBe('A')
  })

  it('works end-to-end against the real active season configuration', () => {
    const cardsByKey = new Map(
      Array.from({ length: ACTIVE_SEASON_CONFIG.rosterSize }, (_, i) => {
        const key = `REAL-${i}`
        return [key, makeCard({ card_key: key, hitter_year: ACTIVE_SEASON_CONFIG.mlbYear, hitter_points: 1 })] as const
      }),
    )
    const assigned = Object.fromEntries([...cardsByKey.keys()].map((key) => [key, key]))
    const roster = buildRoster({ useDh: ACTIVE_SEASON_CONFIG.useDh, rosterState: { assigned } })

    const snapshot = createGameRosterSnapshot(roster, cardsByKey, ACTIVE_SEASON_CONFIG)

    expect(snapshot.playerCount).toBe(ACTIVE_SEASON_CONFIG.rosterSize)
    expect(snapshot.totalPoints).toBe(ACTIVE_SEASON_CONFIG.rosterSize)
  })
})
