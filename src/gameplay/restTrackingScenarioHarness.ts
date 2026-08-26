import { applyAppearanceIncrement, applyFlatPerGameDecrement, applyGameCompletionRest, applyMilestoneDecrement, milestoneBonusForGameCount } from './restTracking'
import type { ScenarioReport, ScenarioResult } from './scenarioHarness'

type TestFn=()=>void
function assert(x:unknown,m:string):asserts x{if(!x)throw new Error(m)}
export function runRestTrackingScenarioMatrix():ScenarioReport{
 const results:ScenarioResult[]=[]; const test=(id:string,category:string,description:string,fn:TestFn)=>{try{fn();results.push({id,category,description,passed:true,detail:'Expected result matched.'})}catch(e){results.push({id,category,description,passed:false,detail:e instanceof Error?e.message:String(e)})}}

 // Step (a): appearance increment
 test('REST-INC-01','Appearance increment','Appeared player gains their full printed fatigue score',()=>assert(applyAppearanceIncrement(2,5,true)===7,'Expected 7.'))
 test('REST-INC-02','Appearance increment','Non-appearing player gains nothing',()=>assert(applyAppearanceIncrement(2,5,false)===2,'Expected 2 (unchanged).'))
 test('REST-INC-03','Appearance increment','Null fatigue score on an appearance counts as 0, not a crash',()=>assert(applyAppearanceIncrement(3,null,true)===3,'Expected 3.'))
 test('REST-INC-04','Appearance increment','Prior debt of 0 plus an appearance still adds the full fatigue score',()=>assert(applyAppearanceIncrement(0,4,true)===4,'Expected 4.'))
 test('REST-INC-05','Appearance increment (broken-formula guard)','Increment is strictly additive, never doubled',()=>assert(applyAppearanceIncrement(1,1,true)===2,'A regression that doubled the increment would return 3 here, not 2.'))

 // Step (b): flat per-game decrement -- the layer message 1 originally asked for and
 // message 2 initially seemed to drop; confirmed back in as its own mandatory step.
 test('REST-FLAT-01','Flat per-game decrement','Every game costs 1, appearance-independent',()=>assert(applyFlatPerGameDecrement(5)===4,'Expected 4.'))
 test('REST-FLAT-02','Flat per-game decrement','Floors at 0, never goes negative',()=>assert(applyFlatPerGameDecrement(0)===0,'Expected 0 floor.'))
 test('REST-FLAT-03','Flat per-game decrement','A fully rested player (0) stays at 0 after a game they did not even appear in',()=>assert(applyFlatPerGameDecrement(0)===0,'Expected 0.'))
 test('REST-FLAT-04','Flat per-game decrement (broken-formula guard)','Decrement is exactly 1, not 2 or 0',()=>assert(applyFlatPerGameDecrement(3)===2,'A regression that skipped this step would return 3, not 2.'))

 // Step (c): milestone bonus decrement, driven by season-configured cadence tiers
 test('REST-MILE-01','Milestone bonus','No bonus on a non-cadence game count',()=>assert(milestoneBonusForGameCount(7,[{gamesPlayed:8,bonusRestDays:1}])===0,'Expected 0.'))
 test('REST-MILE-02','Milestone bonus','Bonus fires exactly on the cadence multiple',()=>assert(milestoneBonusForGameCount(8,[{gamesPlayed:8,bonusRestDays:1}])===1,'Expected 1.'))
 test('REST-MILE-03','Milestone bonus','Bonus fires again on the next multiple, not just the first',()=>assert(milestoneBonusForGameCount(16,[{gamesPlayed:8,bonusRestDays:1}])===1,'Expected 1.'))
 test('REST-MILE-04','Milestone bonus','An empty milestone list (a season with no bonus rest) always returns 0',()=>assert(milestoneBonusForGameCount(8,[])===0,'Expected 0 with no configured tiers.'))
 test('REST-MILE-05','Milestone bonus','Multiple tiers stack when a count lands on both',()=>assert(milestoneBonusForGameCount(72,[{gamesPlayed:9,bonusRestDays:1},{gamesPlayed:72,bonusRestDays:5}])===6,'Expected 1+5=6.'))
 test('REST-MILE-06','Milestone bonus (historical-season shape)','Last season’s two-tier shape: 81 hits both the 9-game and 81-game tiers',()=>assert(milestoneBonusForGameCount(81,[{gamesPlayed:9,bonusRestDays:1},{gamesPlayed:81,bonusRestDays:5}])===6,'Expected 1+5=6.'))
 test('REST-MILEAPPLY-01','Milestone bonus applied','Applying the bonus subtracts it from the running total',()=>assert(applyMilestoneDecrement(5,8,[{gamesPlayed:8,bonusRestDays:1}])===4,'Expected 4.'))
 test('REST-MILEAPPLY-02','Milestone bonus applied','Applying the bonus floors at 0 rather than going negative',()=>assert(applyMilestoneDecrement(0,8,[{gamesPlayed:8,bonusRestDays:1}])===0,'Expected 0 floor.'))
 test('REST-MILE-07','Milestone bonus (broken-formula guard)','A regression that fired every game (not just on cadence) would fail this off-cadence check',()=>assert(milestoneBonusForGameCount(5,[{gamesPlayed:8,bonusRestDays:1}])===0,'Expected 0 -- 5 is not a multiple of 8.'))

 // Full three-step composition
 test('REST-FULL-01','Full sequence','Appeared, non-milestone game: increment then flat -1 only',()=>{
   const r=applyGameCompletionRest({priorHitterGamesRemaining:2,priorPitcherGamesRemaining:0,hitterFatigueScore:5,pitcherFatigueScore:null,hitterAppeared:true,pitcherAppeared:false,gmCompletedGamesThisSeason:3,restMilestones:[{gamesPlayed:8,bonusRestDays:1}]})
   assert(r.hitterGamesRemaining===6,'Expected 2+5-1=6.')
 })
 test('REST-FULL-02','Full sequence','Appeared on a milestone game: increment, then -1 flat, then -1 milestone (matches the user’s own worked example)',()=>{
   const r=applyGameCompletionRest({priorHitterGamesRemaining:2,priorPitcherGamesRemaining:2,hitterFatigueScore:5,pitcherFatigueScore:5,hitterAppeared:true,pitcherAppeared:true,gmCompletedGamesThisSeason:8,restMilestones:[{gamesPlayed:8,bonusRestDays:1}]})
   assert(r.hitterGamesRemaining===5,'Expected 2+5-1-1=5.')
   assert(r.pitcherGamesRemaining===5,'Expected 2+5-1-1=5.')
 })
 test('REST-FULL-03','Full sequence','Did not appear on a milestone game: still gets the flat -1 AND the milestone -1, no increment',()=>{
   const r=applyGameCompletionRest({priorHitterGamesRemaining:3,priorPitcherGamesRemaining:3,hitterFatigueScore:5,pitcherFatigueScore:5,hitterAppeared:false,pitcherAppeared:false,gmCompletedGamesThisSeason:8,restMilestones:[{gamesPlayed:8,bonusRestDays:1}]})
   assert(r.hitterGamesRemaining===1,'Expected 3-1-1=1, no fatigue-score increment since they did not appear.')
 })
 test('REST-FULL-04','Full sequence','Already-rested player (0) with no appearance stays at 0 through an ordinary game',()=>{
   const r=applyGameCompletionRest({priorHitterGamesRemaining:0,priorPitcherGamesRemaining:0,hitterFatigueScore:5,pitcherFatigueScore:5,hitterAppeared:false,pitcherAppeared:false,gmCompletedGamesThisSeason:3,restMilestones:[{gamesPlayed:8,bonusRestDays:1}]})
   assert(r.hitterGamesRemaining===0 && r.pitcherGamesRemaining===0,'Expected both to stay 0.')
 })
 test('REST-FULL-05','Full sequence','Two-way player: hitter and pitcher tracks move independently in the same game',()=>{
   const r=applyGameCompletionRest({priorHitterGamesRemaining:0,priorPitcherGamesRemaining:4,hitterFatigueScore:2,pitcherFatigueScore:6,hitterAppeared:true,pitcherAppeared:false,gmCompletedGamesThisSeason:5,restMilestones:[]})
   assert(r.hitterGamesRemaining===1,'Expected hitter 0+2-1=1 (appeared as hitter).')
   assert(r.pitcherGamesRemaining===3,'Expected pitcher 4-1=3 (did not pitch this game).')
 })
 test('REST-FULL-06','Full sequence (no-bonus season)','An empty restMilestones season never applies a milestone decrement, even on what would be a cadence multiple elsewhere',()=>{
   const r=applyGameCompletionRest({priorHitterGamesRemaining:9,priorPitcherGamesRemaining:0,hitterFatigueScore:0,pitcherFatigueScore:0,hitterAppeared:false,pitcherAppeared:false,gmCompletedGamesThisSeason:8,restMilestones:[]})
   assert(r.hitterGamesRemaining===8,'Expected 9-1=8, flat decrement only, no milestone bonus in a no-bonus season.')
 })

 const categories:ScenarioReport['categories']={};for(const r of results){categories[r.category]??={total:0,passed:0};categories[r.category].total++;if(r.passed)categories[r.category].passed++}return{total:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,categories,results}
}
