import { cardIpOuts, effectiveHitterOnBase, effectivePitcherControl, performanceControlPenalty, postGameRestGames, reliefDistanceRestPenalty } from './fatigueEngine'
import type { ScenarioReport, ScenarioResult } from './scenarioHarness'

type TestFn=()=>void
function assert(x:unknown,m:string):asserts x{if(!x)throw new Error(m)}
export function runFatigueScenarioMatrix():ScenarioReport{
 const results:ScenarioResult[]=[]; const test=(id:string,category:string,description:string,fn:TestFn)=>{try{fn();results.push({id,category,description,passed:true,detail:'Expected Rulebook result matched.'})}catch(e){results.push({id,category,description,passed:false,detail:e instanceof Error?e.message:String(e)})}}
 test('FAT-H-01','Hitter pre-game','OB12 two games from rested becomes OB10',()=>assert(effectiveHitterOnBase(12,2)===10,'Expected OB10.'))
 test('FAT-H-02','Hitter pre-game','Hitter OB floor is 5',()=>assert(effectiveHitterOnBase(6,9)===5,'Expected OB5 floor.'))
 test('FAT-H-03','Default attributes','Default hitter stays OB5 regardless of fatigue',()=>assert(effectiveHitterOnBase(12,8,true)===5,'Expected default OB5.'))
 test('FAT-H-04','Default attributes','Chartless hitter uses OB5',()=>assert(effectiveHitterOnBase(null,8)===5,'Expected OB5.'))
 test('FAT-PRE-01','Pitcher pre-game','Control 6 two games from rested becomes Control 4',()=>assert(effectivePitcherControl({printedControl:6,gamesFromRested:2,cardIp:6,outsRecorded:0,earnedRunsAllowed:0})===4,'Expected C4.'))
 test('FAT-PRE-02','Pitcher pre-game','Pitcher Control floor is -5',()=>assert(effectivePitcherControl({printedControl:1,gamesFromRested:20,cardIp:6,outsRecorded:0,earnedRunsAllowed:0})===-5,'Expected C-5.'))
 test('FAT-PRE-03','Default attributes','Default pitcher stays Control -5',()=>assert(effectivePitcherControl({printedControl:6,useDefaultAttributes:true,gamesFromRested:4,cardIp:6,outsRecorded:0,earnedRunsAllowed:0})===-5,'Expected C-5.'))
 test('FAT-PRE-04','Default attributes','Chartless pitcher uses Control -5',()=>assert(effectivePitcherControl({printedControl:null,gamesFromRested:0,cardIp:null,outsRecorded:0,earnedRunsAllowed:0})===-5,'Expected C-5.'))
 test('FAT-IP-01','IP conversion','5.0 IP equals 15 outs',()=>assert(cardIpOuts(5)===15,'Expected 15.'))
 test('FAT-IP-02','IP conversion','5.1 IP equals 16 outs',()=>assert(cardIpOuts(5.1)===16,'Expected 16.'))
 test('FAT-IP-03','IP conversion','5.2 IP equals 17 outs',()=>assert(cardIpOuts(5.2)===17,'Expected 17.'))
 test('FAT-DIST-01','Distance fatigue','At card IP has no distance penalty',()=>assert(effectivePitcherControl({printedControl:6,cardIp:5,outsRecorded:15,earnedRunsAllowed:1})===6,'Expected C6.'))
 test('FAT-DIST-02','Distance fatigue','One out beyond IP costs 2 Control',()=>assert(effectivePitcherControl({printedControl:6,cardIp:5,outsRecorded:16,earnedRunsAllowed:1})===4,'Expected C4.'))
 test('FAT-DIST-03','Distance fatigue','Two outs beyond IP cost 4 Control',()=>assert(effectivePitcherControl({printedControl:6,cardIp:5,outsRecorded:17,earnedRunsAllowed:1})===2,'Expected C2.'))
 test('FAT-DIST-04','Distance fatigue','Pre-game and distance fatigue stack',()=>assert(effectivePitcherControl({printedControl:6,gamesFromRested:2,cardIp:5,outsRecorded:16,earnedRunsAllowed:1})===2,'Expected C2.'))
 test('FAT-SO-01','Shutout bonus','At 15+ outs with no ER/inherited scoring, beyond-IP outs cost 1 each',()=>assert(effectivePitcherControl({printedControl:6,cardIp:5,outsRecorded:19,earnedRunsAllowed:0,inheritedRunnersScored:0})===2,'Expected C2.'))
 test('FAT-SO-02','Shutout bonus','Shutout distance fatigue stops at Control 0',()=>assert(effectivePitcherControl({printedControl:3,cardIp:5,outsRecorded:20,earnedRunsAllowed:0,inheritedRunnersScored:0})===0,'Expected C0.'))
 test('FAT-SO-03','Shutout bonus','Inherited runner scoring suppresses Shutout Bonus',()=>assert(effectivePitcherControl({printedControl:6,cardIp:5,outsRecorded:16,earnedRunsAllowed:0,inheritedRunnersScored:1})===4,'Expected standard C4.'))
 test('FAT-SO-04','Shutout bonus','Pitcher with IP under 5 uses standard fatigue before 15 outs',()=>assert(effectivePitcherControl({printedControl:6,cardIp:1,outsRecorded:4,earnedRunsAllowed:0})===4,'Expected standard C4 before 15 outs.'))
 test('FAT-ER-01','Performance fatigue','0-3 ER has no performance penalty',()=>assert(performanceControlPenalty(3)===0,'Expected 0.'))
 test('FAT-ER-02','Performance fatigue','4 ER = -1 Control',()=>assert(performanceControlPenalty(4)===1,'Expected 1.'))
 test('FAT-ER-03','Performance fatigue','7 ER = -3 Control',()=>assert(performanceControlPenalty(7)===3,'Expected 3.'))
 test('FAT-ER-04','Performance fatigue','8 ER = -6 Control',()=>assert(performanceControlPenalty(8)===6,'Expected 6.'))
 test('FAT-ER-05','Performance fatigue','9 ER = -10 Control',()=>assert(performanceControlPenalty(9)===10,'Expected 10.'))
 test('FAT-ER-06','Performance fatigue','10+ ER = -15 Control',()=>assert(performanceControlPenalty(10)===15,'Expected 15.'))
 test('FAT-STACK-01','Stacking/floors','Pre-game + distance + performance stack with -5 floor',()=>assert(effectivePitcherControl({printedControl:6,gamesFromRested:2,cardIp:5,outsRecorded:17,earnedRunsAllowed:8})===-5,'Expected C-5 floor.'))
 test('FAT-REST-01','Post-game rest','Appearance adds full card fatigue to existing rest debt',()=>assert(postGameRestGames({gamesFromRested:2,cardFatigue:5,appeared:true})===7,'Expected 7.'))
 test('FAT-REST-02','Post-game rest','No appearance does not add card fatigue',()=>assert(postGameRestGames({gamesFromRested:2,cardFatigue:5,appeared:false})===2,'Expected 2.'))
 test('FAT-REST-03','Post-game rest','Default attributes avoid new fatigue accrual',()=>assert(postGameRestGames({gamesFromRested:2,cardFatigue:5,appeared:true,defaultAttributes:true})===2,'Expected 2.'))
 test('FAT-REL-01','Relief distance rest','Reliever beyond card IP and beyond 1.0 IP adds one rest game',()=>assert(reliefDistanceRestPenalty(1,6)===1,'Expected +1.'))
 test('FAT-REL-02','Relief distance rest','Reliever at 1.0 IP receives no distance rest game',()=>assert(reliefDistanceRestPenalty(1,3)===0,'Expected 0.'))
 test('FAT-REL-03','Relief distance rest','Reliever beyond 1.0 but not beyond longer card IP receives no distance rest game',()=>assert(reliefDistanceRestPenalty(2,4)===0,'Expected 0.'))
 test('FAT-EFF-01','Efficiency bonus','Minimum batters retired with rest day reduces postgame debt by 1',()=>assert(postGameRestGames({gamesFromRested:0,cardFatigue:1,appeared:true,minimumBattersRetired:true,backToBack:false})===0,'Expected 0.'))
 test('FAT-EFF-02','Efficiency bonus','Back-to-back appearance blocks efficiency bonus',()=>assert(postGameRestGames({gamesFromRested:0,cardFatigue:1,appeared:true,minimumBattersRetired:true,backToBack:true})===1,'Expected 1.'))
 test('FAT-NEG-01','Negative-Control exit','Starting C1+ and pitching at C-1 or lower adds one rest game',()=>assert(postGameRestGames({gamesFromRested:0,cardFatigue:2,appeared:true,startedAtControlOneOrHigher:true,pitchedAtNegativeControl:true})===3,'Expected 3.'))
 test('FAT-NEG-02','Negative-Control exit','No extra rest if pitcher never pitched at negative Control',()=>assert(postGameRestGames({gamesFromRested:0,cardFatigue:2,appeared:true,startedAtControlOneOrHigher:true,pitchedAtNegativeControl:false})===2,'Expected 2.'))
 const categories:ScenarioReport['categories']={};for(const r of results){categories[r.category]??={total:0,passed:0};categories[r.category].total++;if(r.passed)categories[r.category].passed++}return{total:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,categories,results}
}
