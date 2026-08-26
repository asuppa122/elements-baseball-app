import { describe, expect, it } from 'vitest'
import { computeDemoRosterTotals, DEMO_ROSTER_SEED, resolveDemoRosterAssignments } from '../demoRoster'
import { makeCard } from '../../testUtils/cardFixtures'

// The real, unique player names in the current seed (several players occupy
// both a defense slot and a lineup slot, so this is fewer than
// DEMO_ROSTER_SEED.length). Deriving this from the real constant, rather than
// hardcoding a name list, keeps these tests correct if the seed ever changes.
const uniqueSeedNames = [...new Set(DEMO_ROSTER_SEED.map(([, name]) => name))]

// resolveDemoRosterAssignments only matches DEMO_ROSTER_YEAR (2025) cards --
// see that constant's own comment in demoRoster.ts for why. Test fixtures
// need hitter_year: 2025 to match for the same reason real seed data does.
function buildFullPool() {
  return uniqueSeedNames.map((name, i) =>
    makeCard({ card_key: `SEED-${i}`, player_name: name, hitter_points: (i + 1) * 10, hitter_year: 2025 }),
  )
}

describe('resolveDemoRosterAssignments', () => {
  it('resolves a seed name case-insensitively to its real card_key', () => {
    const pool = [makeCard({ card_key: 'OHTANI-KEY', player_name: 'shohei ohtani', hitter_year: 2025 })]
    const assignments = resolveDemoRosterAssignments(pool)
    expect(assignments['lineup-1']).toBe('OHTANI-KEY')
  })

  it('resolves every slot sharing a player to the same card_key', () => {
    const pool = [makeCard({ card_key: 'OHTANI-KEY', player_name: 'Shohei Ohtani', hitter_year: 2025 })]
    const assignments = resolveDemoRosterAssignments(pool)
    // Ohtani fills both defense-dh and lineup-1 in the real seed.
    expect(assignments['defense-dh']).toBe('OHTANI-KEY')
    expect(assignments['lineup-1']).toBe('OHTANI-KEY')
  })

  it('silently skips a seed name absent from the given pool', () => {
    const pool = [makeCard({ card_key: 'OHTANI-KEY', player_name: 'Shohei Ohtani', hitter_year: 2025 })]
    const assignments = resolveDemoRosterAssignments(pool)
    expect(assignments['rotation-1']).toBeUndefined()
    expect('rotation-1' in assignments).toBe(false)
  })

  it('resolves every slot when the full seed roster is present in the pool', () => {
    const assignments = resolveDemoRosterAssignments(buildFullPool())
    expect(Object.keys(assignments)).toHaveLength(DEMO_ROSTER_SEED.length)
    expect(new Set(Object.values(assignments)).size).toBe(uniqueSeedNames.length)
  })

  it('ignores a same-name card from a different season, even when it sorts after the 2025 card_key (cross-season regression)', () => {
    // Real-world shape of the bug this guards: the cards table holds every
    // season ever imported. A future season's card_key ("Shohei Ohtani 2026
    // LAD") sorts alphabetically AFTER the 2025 one -- a name-only, unscoped
    // resolver would silently start picking the wrong year the moment a
    // later season gets imported, with no error.
    const pool = [
      makeCard({ card_key: 'Shohei Ohtani 2025 LAD', player_name: 'Shohei Ohtani', hitter_year: 2025 }),
      makeCard({ card_key: 'Shohei Ohtani 2026 LAD', player_name: 'Shohei Ohtani', hitter_year: 2026 }),
    ]
    const assignments = resolveDemoRosterAssignments(pool)
    expect(assignments['lineup-1']).toBe('Shohei Ohtani 2025 LAD')
  })

  it('picks the season-aggregate row for a same-year, multi-team traded player (matches real data shape)', () => {
    // Real shape: a player traded mid-season can have multiple 2025 rows,
    // one per team stint plus a "TOT" aggregate (e.g. real card_keys "Ryan
    // Weathers 2025 SDP" / "...MIA" / "...TOT"). TOT sorts last and is the
    // intended pick -- confirm the within-year tie-break still lands there.
    // Deliberately not pre-ordered TOT-last in the literal -- sorted by
    // card_key below, exactly like the real Supabase query does, so this
    // actually exercises alphabetical order rather than array order.
    const pool = [
      makeCard({ card_key: 'Ryan Weathers 2025 TOT', player_name: 'Ryan Weathers', hitter_year: 2025 }),
      makeCard({ card_key: 'Ryan Weathers 2025 MIA', player_name: 'Ryan Weathers', hitter_year: 2025 }),
      makeCard({ card_key: 'Ryan Weathers 2025 SDP', player_name: 'Ryan Weathers', hitter_year: 2025 }),
    ].sort((a, b) => a.card_key.localeCompare(b.card_key))
    const assignments = resolveDemoRosterAssignments(pool)
    expect(assignments['bullpen-7']).toBe('Ryan Weathers 2025 TOT')
  })
})

describe('computeDemoRosterTotals', () => {
  it('counts a card shared across two slots once, not twice (health-audit 8.1 regression)', () => {
    const cards = [
      makeCard({ card_key: 'OHTANI', hitter_points: 200 }),
      makeCard({ card_key: 'BACKUP', hitter_points: 150 }),
    ]
    const assignments = { 'defense-dh': 'OHTANI', 'lineup-1': 'OHTANI', 'bench-1': 'BACKUP' }

    const totals = computeDemoRosterTotals(cards, assignments)

    expect(totals.playerCount).toBe(2)
    expect(totals.totalPoints).toBe(350)
  })

  it('treats a card missing from the pool as 0 points rather than throwing', () => {
    const totals = computeDemoRosterTotals([], { 'bench-1': 'MISSING-KEY' })
    expect(totals.playerCount).toBe(1)
    expect(totals.totalPoints).toBe(0)
  })

  it('matches a real end-to-end resolve + total against the full seed pool', () => {
    const pool = buildFullPool()
    const assignments = resolveDemoRosterAssignments(pool)
    const totals = computeDemoRosterTotals(pool, assignments)

    const expectedTotal = pool.reduce((sum, card) => sum + (card.hitter_points ?? 0), 0)
    expect(totals.playerCount).toBe(uniqueSeedNames.length)
    expect(totals.totalPoints).toBe(expectedTotal)
  })
})
