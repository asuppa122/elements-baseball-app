import { describe, expect, it } from 'vitest'
import {
  buildCardKeyLookup,
  normalizeForMatch,
  resolveCardKey,
  resolvePublishedRows,
} from './publishedStatusMatching.mjs'

// Real card_keys, same shape confirmed live against public.cards this week
// (Player + Year + Team, straight ASCII apostrophes, no accents).
const REAL_CARD_KEYS = [
  'Nelson Dean 1925 KCM',
  "Andy O'Connor 1908 NYY",
  'Jose Altuve 2020 HOU',
]

describe('normalizeForMatch', () => {
  it('trims, collapses internal whitespace, and lowercases', () => {
    expect(normalizeForMatch('  Nelson   Dean  ')).toBe('nelson dean')
  })

  it('treats null/undefined as an empty string, not a crash', () => {
    expect(normalizeForMatch(null)).toBe('')
    expect(normalizeForMatch(undefined)).toBe('')
  })
})

describe('resolveCardKey', () => {
  const lookup = buildCardKeyLookup(REAL_CARD_KEYS)

  it('resolves an exact-format match', () => {
    expect(resolveCardKey('Nelson Dean', '1925', 'KCM', lookup)).toBe('Nelson Dean 1925 KCM')
  })

  it('resolves despite extra whitespace and different case in the sheet value', () => {
    expect(resolveCardKey('  nelson    DEAN ', '1925', 'kcm', lookup)).toBe('Nelson Dean 1925 KCM')
  })

  it('resolves a real apostrophe name unchanged', () => {
    expect(resolveCardKey("Andy O'Connor", '1908', 'NYY', lookup)).toBe("Andy O'Connor 1908 NYY")
  })

  it('returns null (never throws) for a genuinely unresolved player', () => {
    expect(resolveCardKey('Slim Branham', '1925', 'XXX', lookup)).toBeNull()
  })

  it('returns null rather than a false match for a right-player-wrong-year typo', () => {
    expect(resolveCardKey('Nelson Dean', '1924', 'KCM', lookup)).toBeNull()
  })
})

describe('resolvePublishedRows', () => {
  const lookup = buildCardKeyLookup(REAL_CARD_KEYS)

  it('every input row lands in exactly one of resolved/unresolved -- none silently dropped', () => {
    const rows = [
      { player: 'Nelson Dean', year: '1925', team: 'KCM', published: 'YES', sourceTab: 'Anthony' },
      { player: 'Made Up Player', year: '1925', team: 'ZZZ', published: 'NO', sourceTab: 'Anthony' },
      { player: 'Jose Altuve', year: '2020', team: 'HOU', published: '', sourceTab: 'James' },
    ]

    const { resolved, unresolved } = resolvePublishedRows(rows, lookup)

    expect(resolved).toHaveLength(2)
    expect(unresolved).toHaveLength(1)
    expect(resolved.length + unresolved.length).toBe(rows.length)
  })

  it('maps a real "YES" row to isPublished: true', () => {
    const { resolved } = resolvePublishedRows(
      [{ player: 'Nelson Dean', year: '1925', team: 'KCM', published: 'YES' }],
      lookup,
    )
    expect(resolved[0]).toEqual({ cardKey: 'Nelson Dean 1925 KCM', isPublished: true })
  })

  it('treats a blank/NO published value as isPublished: false, not unresolved', () => {
    const { resolved, unresolved } = resolvePublishedRows(
      [{ player: 'Nelson Dean', year: '1925', team: 'KCM', published: '' }],
      lookup,
    )
    expect(unresolved).toHaveLength(0)
    expect(resolved[0]).toEqual({ cardKey: 'Nelson Dean 1925 KCM', isPublished: false })
  })

  it('is case-insensitive on the published marker itself ("yes" / "Yes" / "YES")', () => {
    const { resolved } = resolvePublishedRows(
      [
        { player: 'Nelson Dean', year: '1925', team: 'KCM', published: 'yes' },
        { player: "Andy O'Connor", year: '1908', team: 'NYY', published: 'Yes' },
      ],
      lookup,
    )
    expect(resolved.every((r) => r.isPublished)).toBe(true)
  })

  it('preserves the unresolved row unchanged for loud reporting -- nothing stripped or guessed', () => {
    const row = { player: 'Slim Branham', year: '1925', team: 'XXX', published: 'YES', sourceTab: 'Anthony' }
    const { unresolved } = resolvePublishedRows([row], lookup)
    expect(unresolved[0]).toBe(row)
  })

  it('a deliberately broken lookup produces zero resolved rows -- proves this suite would actually catch a real regression', () => {
    const { resolved, unresolved } = resolvePublishedRows(
      [{ player: 'Nelson Dean', year: '1925', team: 'KCM', published: 'YES' }],
      new Map(), // empty lookup, simulating cards never loaded
    )
    expect(resolved).toHaveLength(0)
    expect(unresolved).toHaveLength(1)
  })
})
