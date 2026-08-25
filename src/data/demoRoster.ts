import type { CardRecord } from '../types/card'

/**
 * The Elements Baseball demo experience's showcase roster: a hand-picked
 * 26-player 2025 team, resolved by real player name against the currently
 * loaded card pool. Both the Lineup Selector's "2025 Elements Demo" summary
 * card and the Roster editor render this same roster -- this file is the one
 * shared source for it, so the two pages can't independently drift out of
 * sync with each other (see health-audit finding 8.1: LineupSelectorPage
 * used to show a hardcoded, never-recomputed `total_points: 5999` here while
 * RosterPage computed a real, different total from the same intended roster).
 *
 * Known limitation, not fixed here (tracked separately, low urgency): `pick`
 * resolves by player name alone against the *entire* cards table (every
 * season ever imported, not just the active one) and only lands on the
 * right year today because card_key ("{name} {year} {team}") sorts
 * alphabetically the same as chronologically for a given name. Works
 * correctly today; worth hardening later if it ever stops being coincidence.
 */
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
 * doesn't resolve to a real card in the given pool.
 */
export function resolveDemoRosterAssignments(cards: CardRecord[]): Record<string, string> {
  const byName = new Map(cards.map((card) => [card.player_name.trim().toLowerCase(), card.card_key]))
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
