import type { CardRecord } from '../types/card'
import { getCardYear } from '../utils/cardHelpers'

/**
 * The Elements Baseball demo experience's showcase roster: a hand-picked
 * 26-player 2025 team, resolved by real player name against the currently
 * loaded card pool. Both the Lineup Selector's "2025 Elements Demo" summary
 * card and the Roster editor render this same roster -- this file is the one
 * shared source for it, so the two pages can't independently drift out of
 * sync with each other (see health-audit finding 8.1: LineupSelectorPage
 * used to show a hardcoded, never-recomputed `total_points: 5999` here while
 * RosterPage computed a real, different total from the same intended roster).
 */

// The specific real MLB season this hand-picked demo roster showcases --
// unrelated to ACTIVE_SEASON_CONFIG.mlbYear (the League's own 1925
// rules-blueprint year; the `cards` table separately holds real players
// across many real MLB seasons, 2025 among them).
const DEMO_ROSTER_YEAR = 2025

export const DEMO_ROSTER_SEED: Array<[slotId: string, playerName: string]> = [
  ['defense-c', 'Salvador Perez'],
  ['defense-1b', 'Nolan Schanuel'],
  ['defense-2b', 'Brendan Donovan'],
  ['defense-3b', 'Brice Matthews'],
  ['defense-ss', 'Francisco Lindor'],
  ['defense-lf', 'Nathan Lukes'],
  ['defense-cf', 'Ángel Martínez'],
  ['defense-rf', 'Addison Barger'],
  ['defense-dh', 'Shohei Ohtani'],
  ['lineup-1', 'Shohei Ohtani'],
  ['lineup-2', 'Nolan Schanuel'],
  ['lineup-3', 'Francisco Lindor'],
  ['lineup-4', 'Brendan Donovan'],
  ['lineup-5', 'Addison Barger'],
  ['lineup-6', 'Nathan Lukes'],
  ['lineup-7', 'Salvador Perez'],
  ['lineup-8', 'Ángel Martínez'],
  ['lineup-9', 'Brice Matthews'],
  ['bench-1', 'Chad Wallach'],
  ['bench-2', 'Ali Sánchez'],
  ['bench-3', 'Aramis Garcia'],
  ['bench-4', 'CJ Alexander'],
  ['rotation-1', 'Garrett Crochet'],
  ['rotation-2', 'Bryan Woo'],
  ['rotation-3', 'Framber Valdez'],
  ['rotation-4', 'Zack Littell'],
  ['rotation-5', 'Max Scherzer'],
  ['bullpen-1', 'Gabe Speier'],
  ['bullpen-2', 'Jeff Hoffman'],
  ['bullpen-3', 'Valente Bellozo'],
  ['bullpen-4', 'Mitch Spence'],
  ['bullpen-5', 'Tyler Alexander'],
  ['bullpen-6', 'Antonio Senzatela'],
  ['bullpen-7', 'Ryan Weathers'],
  ['bullpen-8', 'Héctor Neris'],
]

/**
 * Resolves each seed player name to a real card_key against the given card
 * pool (case-insensitive name match) and returns the `{ slotId: card_key }`
 * shape RosterPage's `assigned` state uses. Silently skips any name that
 * doesn't resolve to a real DEMO_ROSTER_YEAR card in the given pool.
 *
 * Scoped to DEMO_ROSTER_YEAR explicitly -- the cards table holds every real
 * MLB season ever imported, not just this one, so matching by name alone
 * would drift the moment a later season's cards (e.g. 2026) get imported:
 * a name with both a 2025 and a 2026 row would start silently resolving to
 * whichever one happens to sort last by card_key, not necessarily 2025.
 * A player traded mid-season can still have multiple same-year rows (one
 * per team stint, e.g. "Ryan Weathers 2025 SDP"/"...MIA"/"...TOT" -- keeping
 * the last-by-card_key tie-break for same-year rows preserves today's
 * existing pick (the season aggregate "TOT" row, which already sorts last).
 */
export function resolveDemoRosterAssignments(cards: CardRecord[]): Record<string, string> {
  const byName = new Map(
    cards
      .filter((card) => getCardYear(card) === DEMO_ROSTER_YEAR)
      .map((card) => [card.player_name.trim().toLowerCase(), card.card_key]),
  )
  const assignments: Record<string, string> = {}

  for (const [slot, player] of DEMO_ROSTER_SEED) {
    const key = byName.get(player.toLowerCase())
    if (key) assignments[slot] = key
  }

  return assignments
}

/**
 * Real player count and point total for a resolved demo roster. Sums each
 * unique assigned card once -- a player's defense slot and their
 * lineup/rotation/bullpen slot intentionally share one card_key (the same
 * player, listed in two views at once), and double-counting that would
 * inflate the total. Matches RosterPage's own rosterCardKeys/totalPoints
 * dedup logic.
 */
export function computeDemoRosterTotals(
  cards: CardRecord[],
  assignments: Record<string, string>,
): { playerCount: number; totalPoints: number } {
  const cardByKey = new Map(cards.map((card) => [card.card_key, card]))
  const uniqueKeys = new Set(Object.values(assignments))

  const totalPoints = [...uniqueKeys].reduce(
    (sum, key) => sum + (cardByKey.get(key)?.hitter_points ?? 0),
    0,
  )

  return { playerCount: uniqueKeys.size, totalPoints }
}
