import { loadCardsForGameplayRoster, loadOwnGameplayLineups, type GameplayLabLineup } from './gameRepository'
import { createGameRosterSnapshot, validateRosterForGame, type RosterEligibilityIssue, type SavedRosterForGame } from './rosterSnapshot'
import { ACTIVE_SEASON_CONFIG } from './seasonConfig'
import type { CardRecord } from '../types/card'
import type { GameRosterSnapshot } from './types'

/**
 * A manager choosing which saved Team Builder lineup to play a game with.
 *
 * Game creation (the home manager, in the lab) and the away manager's first
 * pregame visit both need the same three steps: load your own lineups, check
 * each against the active season, freeze the chosen one into a snapshot. One
 * copy, so the two managers cannot be held to different eligibility rules.
 */

export type LineupChoice = {
  lineup: GameplayLabLineup
  cards: Map<string, CardRecord>
  eligibility: ReturnType<typeof validateRosterForGame>
}

export function asSavedRoster(lineup: GameplayLabLineup): SavedRosterForGame {
  return {
    id: lineup.id,
    name: lineup.name,
    useDh: lineup.use_dh,
    playerCount: lineup.player_count,
    totalPoints: lineup.total_points,
    rosterState: {
      assigned: lineup.roster_state?.assigned ?? {},
      rosterFormat: lineup.roster_state?.rosterFormat,
      useDh: lineup.roster_state?.useDh ?? lineup.use_dh,
      seasonEligibleOnly: lineup.roster_state?.seasonEligibleOnly ?? true,
    },
  }
}

export function rosterIssueSummary(issues: RosterEligibilityIssue[]): string {
  if (issues.length === 0) return `Eligible for ${ACTIVE_SEASON_CONFIG.seasonLabel} gameplay.`
  return issues.map((issue) => issue.message).join(' ')
}

/** The signed-in manager's own saved lineups (RLS-scoped), each checked against the active season. */
export async function loadLineupChoices(): Promise<LineupChoice[]> {
  const lineups = await loadOwnGameplayLineups()
  return Promise.all(lineups.map(async (lineup) => {
    const assigned = Object.values(lineup.roster_state?.assigned ?? {}).filter(Boolean)
    const cardList = await loadCardsForGameplayRoster(assigned)
    const cards = new Map(cardList.map((card) => [card.card_key, card]))
    return { lineup, cards, eligibility: validateRosterForGame(asSavedRoster(lineup), cards, ACTIVE_SEASON_CONFIG) }
  }))
}

export function snapshotFor(choice: LineupChoice): GameRosterSnapshot {
  return createGameRosterSnapshot(asSavedRoster(choice.lineup), choice.cards, ACTIVE_SEASON_CONFIG)
}
