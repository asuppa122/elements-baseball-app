import type { CardRecord } from '../types/card'
import { getCardPoints, getCardYear, isSeasonEligibleCard } from '../utils/cardHelpers'
import type { ActiveSeasonConfiguration } from './seasonConfig'
import type { GameCardSnapshot, GameRosterSnapshot } from './types'

export type SavedRosterForGame = {
  id: string
  name: string
  useDh: boolean
  playerCount: number
  totalPoints: number
  rosterState: {
    assigned?: Record<string, string>
    rosterFormat?: string
    useDh?: boolean
    seasonEligibleOnly?: boolean
  }
}

export type RosterEligibilityIssue = {
  code:
    | 'ROSTER_SIZE'
    | 'POINT_CAP'
    | 'DH_CONFIGURATION'
    | 'MISSING_CARD'
    | 'SEASON_INELIGIBLE_CARD'
  message: string
  cardKey?: string
}

export type RosterEligibilityResult = {
  eligible: boolean
  issues: RosterEligibilityIssue[]
}

function snapshotCard(card: CardRecord): GameCardSnapshot {
  const defense: GameCardSnapshot['defense'] = {}
  const pairs = [
    ['C', card.defense_c],
    ['1B', card.defense_1b],
    ['2B', card.defense_2b],
    ['3B', card.defense_3b],
    ['SS', card.defense_ss],
    ['LF', card.defense_lf],
    ['CF', card.defense_cf],
    ['RF', card.defense_rf],
  ] as const

  for (const [position, rating] of pairs) {
    if (rating !== null) defense[position] = rating
  }

  return {
    cardKey: card.card_key,
    playerName: card.player_name,
    imageUrl: card.image_url,
    year: getCardYear(card),
    points: getCardPoints(card),
    hitter: {
      bats: card.hitter_bats,
      onBase: card.hitter_on_base,
      fatigue: card.hitter_fatigue,
      baserunning: card.hitter_baserunning,
      stolenBase: card.hitter_stolen_base,
      chart: {
        PU: card.hitter_pu,
        K: card.hitter_k,
        GB: card.hitter_gb,
        FB: card.hitter_fb,
        BB: card.hitter_bb,
        '1B': card.hitter_1b,
        '1B+': card.hitter_1b_plus,
        '2B': card.hitter_2b,
        '3B': card.hitter_3b,
        HR: card.hitter_hr,
      },
    },
    pitcher: {
      arm: card.pitcher_arm,
      control: card.pitcher_control,
      fatigue: card.pitcher_fatigue,
      ip: card.pitcher_ip,
      chart: {
        PU: card.pitcher_pu,
        K: card.pitcher_k,
        GB: card.pitcher_gb,
        FB: card.pitcher_fb,
        BB: card.pitcher_bb,
        '1B': card.pitcher_1b,
        '2B': card.pitcher_2b,
        '3B': card.pitcher_3b,
        HR: card.pitcher_hr,
      },
    },
    defense,
  }
}

export function validateRosterForGame(
  roster: SavedRosterForGame,
  cardsByKey: ReadonlyMap<string, CardRecord>,
  configuration: ActiveSeasonConfiguration,
): RosterEligibilityResult {
  const issues: RosterEligibilityIssue[] = []
  const assignments = roster.rosterState.assigned ?? {}
  const uniqueCardKeys = [...new Set(Object.values(assignments).filter(Boolean))]

  if (uniqueCardKeys.length !== configuration.rosterSize) {
    issues.push({
      code: 'ROSTER_SIZE',
      message: `Roster has ${uniqueCardKeys.length} unique players; ${configuration.rosterSize} are required for ${configuration.seasonLabel}.`,
    })
  }

  const assignedCards = uniqueCardKeys
    .map((cardKey) => cardsByKey.get(cardKey))
    .filter((card): card is CardRecord => Boolean(card))

  const recalculatedPoints = assignedCards.reduce((sum, card) => sum + getCardPoints(card), 0)
  if (recalculatedPoints > configuration.pointCap) {
    issues.push({
      code: 'POINT_CAP',
      message: `Roster uses ${recalculatedPoints.toLocaleString()} points; the cap is ${configuration.pointCap.toLocaleString()}.`,
    })
  }

  const rosterUsesDh = roster.useDh ?? roster.rosterState.useDh ?? true
  if (rosterUsesDh !== configuration.useDh) {
    issues.push({
      code: 'DH_CONFIGURATION',
      message: configuration.useDh
        ? 'This game requires a designated hitter.'
        : 'This game does not use a designated hitter.',
    })
  }

  for (const cardKey of uniqueCardKeys) {
    const card = cardsByKey.get(cardKey)

    if (!card) {
      issues.push({
        code: 'MISSING_CARD',
        cardKey,
        message: `Card ${cardKey} could not be found in the current card database.`,
      })
      continue
    }

    if (configuration.requireSeasonEligibleCards && !isSeasonEligibleCard(card)) {
      issues.push({
        code: 'SEASON_INELIGIBLE_CARD',
        cardKey,
        message: `${card.player_name} (${getCardYear(card) ?? 'unknown year'}) is not Season Eligible.`,
      })
    }
  }

  return { eligible: issues.length === 0, issues }
}

export function createGameRosterSnapshot(
  roster: SavedRosterForGame,
  cardsByKey: ReadonlyMap<string, CardRecord>,
  configuration: ActiveSeasonConfiguration,
  capturedAt = new Date().toISOString(),
): GameRosterSnapshot {
  const validation = validateRosterForGame(roster, cardsByKey, configuration)

  if (!validation.eligible) {
    throw new Error(validation.issues.map((issue) => issue.message).join(' '))
  }

  const assignments = structuredClone(roster.rosterState.assigned ?? {})
  const uniqueCardKeys = [...new Set(Object.values(assignments).filter(Boolean))]
  const cards: Record<string, GameCardSnapshot> = {}

  for (const cardKey of uniqueCardKeys) {
    const card = cardsByKey.get(cardKey)
    if (!card) continue
    cards[cardKey] = snapshotCard(card)
  }

  return {
    sourceLineupId: roster.id,
    sourceLineupName: roster.name,
    capturedAt,
    rosterFormat: roster.rosterState.rosterFormat ?? 'unknown',
    useDh: roster.useDh ?? roster.rosterState.useDh ?? true,
    seasonEligibleOnly: roster.rosterState.seasonEligibleOnly ?? true,
    playerCount: uniqueCardKeys.length,
    totalPoints: Object.values(cards).reduce((sum, card) => sum + card.points, 0),
    assignments,
    cards,
  }
}
