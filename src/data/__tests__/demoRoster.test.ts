import { describe, expect, it } from 'vitest'
import { computeDemoRosterTotals, DEMO_ROSTER_SEED, resolveDemoRosterAssignments } from '../demoRoster'
import { makeCard } from '../../testUtils/cardFixtures'

// The real, unique player names in the current seed (several players occupy
// both a defense slot and a lineup slot, so this is fewer than
// DEMO_ROSTER_SEED.length). Deriving this from the real constant, rather than
// hardcoding a name list, keeps these tests correct if the seed ever changes.
const uniqueSeedNames = [...new Set(DEMO_ROSTER_SEED.map(([, name]) => name))]

function buildFullPool() {
  return uniqueSeedNames.map((name, i) =>
    makeCard({ card_key: `SEED-${i}`, player_name: name, hitter_points: (i + 1) * 10 }),
  )
}

describe('resolveDemoRosterAssignments', () => {
  it('resolves a seed name case-insensitively to its real card_key', () => {
    const pool = [makeCard({ card_key: 'OHTANI-KEY', player_name: 'shohei ohtani' })]
    const assignments = resolveDemoRosterAssignments(pool)
    expect(assignments['lineup-1']).toBe('OHTANI-KEY')
  })

  it('resolves every slot sharing a player to the same card_key', () => {
    const pool = [makeCard({ card_key: 'OHTANI-KEY', player_name: 'Shohei Ohtani' })]
    const assignments = resolveDemoRosterAssignments(pool)
    // Ohtani fills both defense-dh and lineup-1 in the real seed.
    expect(assignments['defense-dh']).toBe('OHTANI-KEY')
    expect(assignments['lineup-1']).toBe('OHTANI-KEY')
  })

  it('silently skips a seed name absent from the given pool', () => {
    const pool = [makeCard({ card_key: 'OHTANI-KEY', player_name: 'Shohei Ohtani' })]
    const assignments = resolveDemoRosterAssignments(pool)
    expect(assignments['rotation-1']).toBeUndefined()
    expect('rotation-1' in assignments).toBe(false)
  })

  it('resolves every slot when the full seed roster is present in the pool', () => {
    const assignments = resolveDemoRosterAssignments(buildFullPool())
    expect(Object.keys(assignments)).toHaveLength(DEMO_ROSTER_SEED.length)
    expect(new Set(Object.values(assignments)).size).toBe(uniqueSeedNames.length)
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
