export type MlbTimelineRules = {
  automaticExtraInningRunner: boolean
  rosterEraBaseline: 'pre-2020' | '2020-plus'
}

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
