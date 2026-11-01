import { gbAllSafe, gbContactPlay, gbInfieldInForcedOut, gbInfieldInHold, gbRunnerOnSecondRoll, gbSingularOut, gbStandardDoublePlay, gbThirdToFirstDoublePlay, gbTriplePlay, groundBallChoices, infieldInBranch, type GbOutcome } from './groundBallResolution'
import { fieldingCheckIsOut } from './ruleAssertions'
import type { BaseRunnerState, BasesState } from './types'

/**
 * Compact ground-ball API for the scenario harnesses and rule demos: a base
 * state and forced rolls in, the outcome out, without a whole game state.
 *
 * Since 2026-11-01 (D3) every function here is a thin adapter over
 * groundBallResolution.ts -- the same outcome functions and the same choice
 * legality the live decision flow uses. It used to carry its own copy, which
 * had drifted: an Infield In out that left every runner on base, a triple play
 * that dropped the runner from third with the bases loaded, and a triple play
 * offered without its fielding requirement.
 */

export type GbChoice='AUTO_OUT'|'STANDARD_DP'|'THIRD_TO_FIRST_DP'|'TRIPLE_PLAY'|'CONTACT_PLAY'
export type GbCombo='1B+2B+3B'|'1B+2B+SS'|'1B+3B+SS'
export type GbState={outs:0|1; bases:BasesState; batter:BaseRunnerState; infieldIn:boolean}
export type GbResult={outsAdded:number;bases:BasesState;runs:number;complete:boolean;note:string}

const toResult=(o:GbOutcome,note:string):GbResult=>({outsAdded:o.outsAdded,bases:o.bases,runs:o.scorers.length,complete:true,note})

export function infieldCheckOut(roll:number,def:number,bsr:number){return fieldingCheckIsOut(roll,roll+def,bsr)}

/**
 * Legal choices. `fielding` (2B and 3B ratings) gates the triple play exactly
 * as the live game does; omitted, it is assumed met (the harnesses that call
 * this without it construct triple-play-capable defences).
 */
export function gbLegalChoices(s:GbState,hasThirdCombo=true,fielding:{secondBase:number;thirdBase:number}={secondBase:4,thirdBase:2}):GbChoice[]{
 const choices=groundBallChoices({pre:s.bases,outs:s.outs,infieldIn:s.infieldIn,eligibleCombos:hasThirdCombo?['1B+2B+SS','1B+2B+3B','1B+3B+SS']:['1B+2B+SS'],secondBaseFielding:fielding.secondBase,thirdBaseFielding:fielding.thirdBase,rulesV2:true})
 if(s.infieldIn)return choices.map(c=>c==='CONTACT_PLAY'?'CONTACT_PLAY':'AUTO_OUT')
 if(!choices.length)return['AUTO_OUT']
 const map:Record<string,GbChoice>={TAKE_SINGULAR_OUT:'AUTO_OUT',ATTEMPT_STANDARD_DBP:'STANDARD_DP',ATTEMPT_3B_1B_DBP:'THIRD_TO_FIRST_DP',ATTEMPT_TRIPLE_PLAY:'TRIPLE_PLAY'}
 return choices.map(c=>map[c])
}

/** The "take the out" branch: Infield In outcomes, the singular-out RFO, the 1B-open branches. */
export function resolveAutoOut(s:GbState,rfo:number):GbResult{
 const b=s.bases
 if(s.infieldIn){
  if(infieldInBranch(b)==='forced_out')return toResult(gbInfieldInForcedOut(b,s.batter,s.outs),'INF IN: lead runner forced out; hitter safe')
  return toResult(gbInfieldInHold(b,s.batter,s.outs,true),'INF IN: runners hold unless forced; hitter out')
 }
 if(b.first)return toResult(gbSingularOut(b,s.batter,s.outs,rfo),b.second?'1B/2B automatic-out RFO':'1B automatic-out RFO')
 // 1B open: the batter is out at 1B, a runner on 3B scores, a runner on 2B rolls to hold.
 const runs=b.third&&s.outs+1<3?1:0
 if(b.second){const bases=s.outs+1>=3?{first:null,second:null,third:null}:gbRunnerOnSecondRoll(b,rfo);return{outsAdded:1,bases,runs,complete:true,note:'2B Roll To Hold; hitter out'}}
 if(b.third)return{outsAdded:1,bases:{first:null,second:null,third:null},runs,complete:true,note:'3B scores; hitter out'}
 return{outsAdded:1,bases:{...b},runs:0,complete:true,note:'Bases empty: hitter out'}
}

function dp(s:GbState,comboDef:number,lead:BaseRunnerState,firstRoll:number,secondRoll:number|undefined,resolve:(leadOut:boolean,batterOut:boolean)=>GbOutcome,note:string):GbResult{
 if(firstRoll===1)return toResult(gbAllSafe(s.bases,s.batter,s.outs),`${note}: roll 1, all safe`)
 if(firstRoll===20)return toResult(resolve(true,true),`${note}: roll 20, double play`)
 if(secondRoll==null)throw new Error('Second DP fielding roll required.')
 return toResult(resolve(infieldCheckOut(firstRoll,comboDef,lead.baserunning??10),infieldCheckOut(secondRoll,comboDef,s.batter.baserunning??10)),`${note} checks resolved`)
}
export function resolveStandardDp(s:GbState,comboDef:number,firstRoll:number,secondRoll?:number):GbResult{
 if(!s.bases.first)throw new Error('Standard DP requires runner on 1B.')
 return dp(s,comboDef,s.bases.first,firstRoll,secondRoll,(l,b)=>gbStandardDoublePlay(s.bases,s.batter,s.outs,l,b),'2B DP')
}
export function resolveThirdToFirstDp(s:GbState,comboDef:number,firstRoll:number,secondRoll?:number):GbResult{
 if(!s.bases.first||!s.bases.second)throw new Error('3B→1B DP requires runners on 1B and 2B.')
 return dp(s,comboDef,s.bases.second,firstRoll,secondRoll,(l,b)=>gbThirdToFirstDoublePlay(s.bases,s.batter,s.outs,l,b),'3B DP')
}
/** Triple play: the d20 alone against each runner; each check needs the out before it. */
export function resolveTriplePlay(s:GbState,roll1:number,roll2?:number,roll3?:number):GbResult{
 if(s.outs!==0||!s.bases.first||!s.bases.second)throw new Error('Triple play requires 0 outs and runners on 1B/2B.')
 const b=s.bases,r1=b.first!,r2=b.second!
 if(roll1===1)return toResult(gbAllSafe(b,s.batter,s.outs),'TP roll 1: all safe')
 if(!infieldCheckOut(roll1,0,r2.baserunning??10))return toResult(gbTriplePlay(b,s.batter,s.outs,false,false,false),'TP first check failed; subsequent runners safe')
 if(roll1===20)return toResult(gbTriplePlay(b,s.batter,s.outs,true,true,true),'Automatic triple play')
 if(roll2==null)throw new Error('TP second roll required.')
 if(roll2===1||!infieldCheckOut(roll2,0,r1.baserunning??10))return toResult(gbTriplePlay(b,s.batter,s.outs,true,false,false),'TP second check failed; batter safe')
 if(roll2===20)return toResult(gbTriplePlay(b,s.batter,s.outs,true,true,true),'TP completed on second natural 20')
 if(roll3==null)throw new Error('TP third roll required.')
 return toResult(gbTriplePlay(b,s.batter,s.outs,true,true,infieldCheckOut(roll3,0,s.batter.baserunning??10)),'TP sequence resolved')
}
/** Infield In contact play: d20 + full infield and catcher DEF against the lead runner. */
export function resolveContactPlay(s:GbState,fullDef:number,roll:number):GbResult{
 if(!s.infieldIn||infieldInBranch(s.bases)!=='hold')throw new Error('Contact play requires INF IN and a hold state (R2, R3, R2+R3 or R1+R3).')
 const lead=s.bases.third??s.bases.second??s.bases.first
 return toResult(gbContactPlay(s.bases,s.batter,s.outs,lead?infieldCheckOut(roll,fullDef,lead.baserunning??10):false),'Contact play resolved')
}
