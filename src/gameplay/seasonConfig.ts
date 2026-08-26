export type MlbTimelineRules = {
  automaticExtraInningRunner: boolean
  rosterEraBaseline: 'pre-2020' | '2020-plus'
}

// One periodic bonus-rest tier: every time a GM's completed-game count this
// season is a multiple of `gamesPlayed`, every rostered player's Ftg/Rm rest
// counters get an additional `bonusRestDays` knocked off (on top of the flat
// -1-per-game decrement that always applies -- see restTracking.ts). A season
// with no bonus-rest tiers at all is `[]`, not a special case elsewhere.
export type RestMilestone = { gamesPlayed: number; bonusRestDays: number }

export type ActiveSeasonConfiguration = {
  seasonId: string
  seasonLabel: string
  blueprintLabel: string
  mlbYear: number
  rosterSize: number
  pointCap: number
  useDh: boolean
  requireSeasonEligibleCards: boolean
  timelineRules: MlbTimelineRules
  restMilestones: RestMilestone[]
}

export function getMlbTimelineRules(mlbYear: number): MlbTimelineRules {
  return {
    automaticExtraInningRunner: mlbYear >= 2023,
    rosterEraBaseline: mlbYear >= 2020 ? '2020-plus' : 'pre-2020',
  }
}

export const SEASON_CONFIGURATIONS: Record<string, ActiveSeasonConfiguration> = {
  '10.1': {
    seasonId: '10.1',
    seasonLabel: 'Season 10.1',
    blueprintLabel: '1925',
    mlbYear: 1925,
    rosterSize: 18,
    pointCap: 4000,
    useDh: false,
    requireSeasonEligibleCards: true,
    timelineRules: getMlbTimelineRules(1925),
    // Confirmed for this season: one bonus-rest tier, +1 rest day every 8 GM
    // games completed. (Last season's Rulebook text -- kept here only as a
    // reference shape for a past-season config, not wired to any active
    // season ID -- had two tiers: +1 at 9 games, +5 at 81 games. See
    // GAMEPLAY_REFERENCE_NOTES.md-adjacent chat history for the discrepancy
    // this replaced.)
    restMilestones: [{ gamesPlayed: 8, bonusRestDays: 1 }],
  },
}

export const ACTIVE_SEASON_ID = '10.1'
export const ACTIVE_SEASON_CONFIG = SEASON_CONFIGURATIONS[ACTIVE_SEASON_ID]

if (!ACTIVE_SEASON_CONFIG) {
  throw new Error(`Missing gameplay configuration for active Elements season ${ACTIVE_SEASON_ID}.`)
}

export function cloneSeasonConfiguration(
  configuration: ActiveSeasonConfiguration,
): ActiveSeasonConfiguration {
  return structuredClone(configuration)
}
