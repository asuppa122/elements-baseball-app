import { CURRENT_STANDINGS } from './standings'

export type SeasonManager = 'Anthony' | 'Ben' | 'Chuck' | 'Eric' | 'James' | 'Jeremiah' | 'Nate' | 'Ryan' | 'Will' | 'Zeek'

export const SEASON10_MANAGERS: SeasonManager[] = ['Anthony','Ben','Chuck','Eric','James','Jeremiah','Nate','Ryan','Will','Zeek']

export type Season10Tracker = {
  totalGames: number
  wins: number
  losses: number
}

// Sole GP source of truth for milestone progress: Document1 → STANDINGS → Season 10.1 Total.
// All-time totals and Discord result exports are intentionally excluded.
export const SEASON10_TRACKING = Object.fromEntries(
  CURRENT_STANDINGS.map(row => [row.manager, { totalGames: row.games, wins: row.wins, losses: row.losses }])
) as Record<SeasonManager, Season10Tracker>

const seasonTotals = CURRENT_STANDINGS.map(row => row.games)

export const SEASON10_COMMUNITY = {
  totalGames: Math.round(seasonTotals.reduce((sum, games) => sum + games, 0) / 2),
  managersAt25: seasonTotals.filter(games => games >= 25).length,
  managersAt50: seasonTotals.filter(games => games >= 50).length,
  managersAt75: seasonTotals.filter(games => games >= 75).length,
  managersAt100: seasonTotals.filter(games => games >= 100).length,
}

export const SEASON10_TRACKING_UPDATED = 'Document1 workbook snapshot • August 10, 2026'
