import { getMlbTimelineRules, type ActiveSeasonConfiguration } from './seasonConfig'
import type { GameSide, HalfInning } from './types'

export type ScoreState = Record<GameSide, number>
export type ThirdOutType = 'force' | 'batter_runner_before_first' | 'tag' | 'caught_stealing' | 'non_force_advance'

export function battingSide(half: HalfInning): GameSide {
  return half === 'top' ? 'away' : 'home'
}

export function nextHalfBoundary(inning: number, half: HalfInning): { inning: number; half: HalfInning } {
  return half === 'top' ? { inning, half: 'bottom' } : { inning: inning + 1, half: 'top' }
}

export function isWalkoffState(inning: number, half: HalfInning, score: ScoreState): boolean {
  return inning >= 9 && half === 'bottom' && score.home > score.away
}

export function shouldEndAfterThirdOut(inning: number, half: HalfInning, score: ScoreState): boolean {
  if (inning < 9) return false
  if (half === 'top') return score.home > score.away
  return score.home !== score.away
}

export function shouldContinueToExtraInnings(inning: number, half: HalfInning, score: ScoreState): boolean {
  return inning >= 9 && half === 'bottom' && score.home === score.away
}

export function runCountsBeforeThirdOut(args: { thirdOutType: ThirdOutType; leadRunnerCompletedBeforeOut: boolean }): boolean {
  if (args.thirdOutType === 'force' || args.thirdOutType === 'batter_runner_before_first') return false
  return args.leadRunnerCompletedBeforeOut
}

export function automaticExtraInningRunnerApplies(mlbYear: number, inning: number): boolean {
  return inning >= 10 && getMlbTimelineRules(mlbYear).automaticExtraInningRunner
}

export function rosterEraSize(mlbYear: number): 26 | null {
  return getMlbTimelineRules(mlbYear).rosterEraBaseline === '2020-plus' ? 26 : null
}

export function validateSeasonBoundaryConfiguration(configuration: ActiveSeasonConfiguration): string[] {
  const issues: string[] = []
  if (configuration.rosterSize <= 0) issues.push('Roster size must be positive.')
  if (configuration.pointCap <= 0) issues.push('Point cap must be positive.')
  if (configuration.mlbYear === 1925) {
    if (configuration.useDh) issues.push('1925 blueprint must not use a DH.')
    if (configuration.timelineRules.automaticExtraInningRunner) issues.push('1925 blueprint cannot use the automatic extra-inning runner.')
  }
  if (configuration.timelineRules.automaticExtraInningRunner !== (configuration.mlbYear >= 2023)) {
    issues.push('Automatic-runner flag does not match MLB timeline boundary.')
  }
  return issues
}
