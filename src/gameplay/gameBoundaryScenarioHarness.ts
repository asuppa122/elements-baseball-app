import { ACTIVE_SEASON_CONFIG, getMlbTimelineRules } from './seasonConfig'
import { effectivePitcherControl } from './fatigueEngine'
import { extraBaseEffectiveBaserunning, fieldingCheckIsOut } from './ruleAssertions'
import { infieldCheckOut } from './groundBallEngine'
import type { ScenarioReport, ScenarioResult } from './scenarioHarness'
import { automaticExtraInningRunnerApplies, isWalkoffState, nextHalfBoundary, rosterEraSize, runCountsBeforeThirdOut, shouldContinueToExtraInnings, shouldEndAfterThirdOut, validateSeasonBoundaryConfiguration } from './gameBoundaryEngine'

export function runGameBoundaryScenarioMatrix(): ScenarioReport {
  const results: ScenarioResult[] = []
  const test = (id:string, category:string, description:string, fn:()=>void) => {
    try { fn(); results.push({id,category,description,passed:true,detail:'Expected game-state result matched.'}) }
    catch (e) { results.push({id,category,description,passed:false,detail:e instanceof Error?e.message:String(e)}) }
  }
  const a=(condition:unknown,message:string)=>{if(!condition)throw new Error(message)}

  test('GAME-HALF-01','Inning transitions','Top half advances to bottom of same inning',()=>{const n=nextHalfBoundary(4,'top');a(n.inning===4&&n.half==='bottom','Expected bottom 4.')})
  test('GAME-HALF-02','Inning transitions','Bottom half advances to top of next inning',()=>{const n=nextHalfBoundary(4,'bottom');a(n.inning===5&&n.half==='top','Expected top 5.')})
  test('GAME-END-01','Regulation ending','Home lead after top 9 third out ends game',()=>a(shouldEndAfterThirdOut(9,'top',{home:4,away:3}),'Expected game over.'))
  test('GAME-END-02','Regulation ending','Away lead after top 9 does not end game',()=>a(!shouldEndAfterThirdOut(9,'top',{home:3,away:4}),'Home must bat.'))
  test('GAME-END-03','Regulation ending','Away lead after bottom 9 third out ends game',()=>a(shouldEndAfterThirdOut(9,'bottom',{home:3,away:4}),'Expected game over.'))
  test('GAME-END-04','Regulation ending','Tie after bottom 9 continues',()=>a(shouldContinueToExtraInnings(9,'bottom',{home:3,away:3}),'Expected extras.'))
  test('GAME-END-05','Regulation ending','Non-tie before inning 9 never ends by inning boundary',()=>a(!shouldEndAfterThirdOut(8,'bottom',{home:8,away:1}),'Must play at least 9 innings.'))
  test('WALKOFF-01','Walk-off','Home lead created in bottom 9 is immediate walk-off',()=>a(isWalkoffState(9,'bottom',{home:5,away:4}),'Expected walk-off.'))
  test('WALKOFF-02','Walk-off','Tie in bottom 9 is not yet a walk-off',()=>a(!isWalkoffState(9,'bottom',{home:4,away:4}),'Tie must continue.'))
  test('WALKOFF-03','Walk-off','Bottom extra-inning lead is a walk-off',()=>a(isWalkoffState(12,'bottom',{home:2,away:1}),'Expected extra-inning walk-off.'))

  test('SCORE-3OUT-01','Third-out scoring','Force third out prevents run from counting',()=>a(!runCountsBeforeThirdOut({thirdOutType:'force',leadRunnerCompletedBeforeOut:true}),'Force third out must erase run.'))
  test('SCORE-3OUT-02','Third-out scoring','Batter-runner third out before first prevents run',()=>a(!runCountsBeforeThirdOut({thirdOutType:'batter_runner_before_first',leadRunnerCompletedBeforeOut:true}),'Batter-runner third out must erase run.'))
  test('SCORE-3OUT-03','Third-out scoring','Trailing non-force out after lead runner completes allows run',()=>a(runCountsBeforeThirdOut({thirdOutType:'non_force_advance',leadRunnerCompletedBeforeOut:true}),'Lead run should count.'))
  test('SCORE-3OUT-04','Third-out scoring','Tag/advance run does not count if lead runner had not completed',()=>a(!runCountsBeforeThirdOut({thirdOutType:'tag',leadRunnerCompletedBeforeOut:false}),'Run must not count before completion.'))

  test('SEASON-1925-01','Season boundaries','Season 10.1 1925 blueprint remains 18/4000/DH off',()=>a(ACTIVE_SEASON_CONFIG.mlbYear===1925&&ACTIVE_SEASON_CONFIG.rosterSize===18&&ACTIVE_SEASON_CONFIG.pointCap===4000&&!ACTIVE_SEASON_CONFIG.useDh,'1925 configuration mismatch.'))
  test('SEASON-1925-02','Season boundaries','1925 has no automatic extra-inning runner',()=>a(!getMlbTimelineRules(1925).automaticExtraInningRunner,'1925 runner must be off.'))
  test('SEASON-2020-01','Season boundaries','2019 is before 26-man roster-era baseline',()=>a(rosterEraSize(2019)===null,'2019 must be pre-2020 baseline.'))
  test('SEASON-2020-02','Season boundaries','2020 activates 26-man roster-era baseline',()=>a(rosterEraSize(2020)===26,'2020 must activate 26-man baseline.'))
  test('SEASON-2023-01','Season boundaries','2022 has no automatic runner',()=>a(!automaticExtraInningRunnerApplies(2022,10),'2022 must not use runner.'))
  test('SEASON-2023-02','Season boundaries','2023 inning 9 has no automatic runner',()=>a(!automaticExtraInningRunnerApplies(2023,9),'Runner starts only in extras.'))
  test('SEASON-2023-03','Season boundaries','2023 inning 10 activates automatic runner',()=>a(automaticExtraInningRunnerApplies(2023,10),'2023 extras must use runner.'))
  test('SEASON-CONFIG-01','Season boundaries','Active season configuration passes boundary validation',()=>a(validateSeasonBoundaryConfiguration(ACTIVE_SEASON_CONFIG).length===0,'Active config failed boundary validation.'))

  test('REG-ADV-01','Multi-mechanic regression','Two-out 2B-to-home hit advancement uses +6 BsR',()=>a(extraBaseEffectiveBaserunning(14,'2B','HOME',2)===20,'Expected BsR20.'))
  test('REG-ADV-02','Multi-mechanic regression','Equality on OF fielding remains safe',()=>a(!fieldingCheckIsOut(10,4,14),'Tie must remain safe.'))
  test('REG-GB-01','Multi-mechanic regression','Equality on INF fielding remains safe',()=>a(!infieldCheckOut(10,2,12),'Tie must remain safe.'))
  test('REG-GB-02','Multi-mechanic regression','Natural 20 on INF check remains automatic out',()=>a(infieldCheckOut(20,-99,99),'Natural 20 must be out.'))
  test('REG-GB-03','Multi-mechanic regression','Natural 1 on INF check remains all safe',()=>a(!infieldCheckOut(1,99,1),'Natural 1 must be safe.'))
  test('REG-FAT-01','Multi-mechanic regression','Pregame + distance fatigue still stack',()=>a(effectivePitcherControl({printedControl:6,gamesFromRested:2,cardIp:5,outsRecorded:16,earnedRunsAllowed:1})===2,'Expected Control 2.'))
  test('REG-FAT-02','Multi-mechanic regression','Fatigue Control floor remains -5',()=>a(effectivePitcherControl({printedControl:2,gamesFromRested:3,cardIp:1,outsRecorded:12,earnedRunsAllowed:10})===-5,'Expected -5 floor.'))
  test('REG-SEASON-01','Multi-mechanic regression','1925 extra innings stay free of modern automatic-runner rule',()=>a(!automaticExtraInningRunnerApplies(ACTIVE_SEASON_CONFIG.mlbYear,10),'1925 extras must have no automatic runner.'))

  const categories: ScenarioReport['categories']={}
  for(const r of results){categories[r.category]??={total:0,passed:0};categories[r.category].total++;if(r.passed)categories[r.category].passed++}
  return {total:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,categories,results}
}
