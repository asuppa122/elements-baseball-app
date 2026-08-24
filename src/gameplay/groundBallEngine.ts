import type { BaseRunnerState, BasesState } from './types'

export type GbChoice='AUTO_OUT'|'STANDARD_DP'|'THIRD_TO_FIRST_DP'|'TRIPLE_PLAY'|'CONTACT_PLAY'
export type GbCombo='1B+2B+3B'|'1B+2B+SS'|'1B+3B+SS'
export type GbState={outs:0|1; bases:BasesState; batter:BaseRunnerState; infieldIn:boolean}
export type GbResult={outsAdded:number;bases:BasesState;runs:number;complete:boolean;note:string}
const clone=(b:BasesState):BasesState=>structuredClone(b)
const put=(b:BasesState,base:'first'|'second'|'third',r:BaseRunnerState|null)=>{b[base]=r}

export function infieldCheckOut(roll:number,def:number,bsr:number){if(roll===1)return false;if(roll===20)return true;return roll+def>bsr}
export function gbLegalChoices(s:GbState,hasThirdCombo=true):GbChoice[]{
 if(s.infieldIn)return ['AUTO_OUT',...(s.bases.third?['CONTACT_PLAY' as GbChoice]:[])]
 if(!s.bases.first)return ['AUTO_OUT']
 const out:GbChoice[]=['AUTO_OUT','STANDARD_DP']
 if(s.bases.second&&hasThirdCombo)out.push('THIRD_TO_FIRST_DP')
 if(s.outs===0&&s.bases.second&&hasThirdCombo)out.push('TRIPLE_PLAY')
 return out
}
export function resolveAutoOut(s:GbState,rfo:number):GbResult{
 const b=clone(s.bases);let runs=0
 if(s.infieldIn){
  if(b.first&&!b.second&&!b.third){b.second=b.first;b.first=s.batter;return{outsAdded:1,bases:b,runs,complete:true,note:'INF IN: lead runner out; hitter safe'}}
  if(b.first&&b.second&&!b.third){b.third=b.second;b.second=b.first;b.first=s.batter;return{outsAdded:1,bases:b,runs,complete:true,note:'INF IN: lead runner out; hitter safe'}}
  if(b.first&&b.second&&b.third){b.third=b.second;b.second=b.first;b.first=s.batter;return{outsAdded:1,bases:b,runs,complete:true,note:'INF IN loaded: runner home out'}}
  // 2B/3B/2B+3B/1B+3B: runners hold unless forced, hitter out.
  return{outsAdded:1,bases:b,runs,complete:true,note:'INF IN: runners hold; hitter out'}
 }
 if(b.first&&b.second){const r1=b.first,r2=b.second,r3=b.third;b.first=null;b.second=null;b.third=null;if(rfo<=5){put(b,'second',r1);put(b,'third',r2);if(r3)runs++}else if(rfo<=15){put(b,'first',s.batter);put(b,'third',r2);if(r3)runs++}else{put(b,'first',s.batter);put(b,'second',r1);if(r3)runs++}return{outsAdded:1,bases:b,runs,complete:true,note:'1B/2B automatic-out RFO'}}
 if(b.first){const r1=b.first,r2=b.second,r3=b.third;b.first=null;if(rfo<=5){put(b,'second',r1);put(b,'first',null)}else{put(b,'first',s.batter)}if(r2)put(b,'third',r2);if(r3)runs++;return{outsAdded:1,bases:b,runs,complete:true,note:'1B automatic-out RFO'}}
 if(b.second){if(rfo<=10){b.third=b.second;b.second=null}return{outsAdded:1,bases:b,runs,complete:true,note:'2B Roll To Hold; hitter out'}}
 if(b.third){b.third=null;runs++;return{outsAdded:1,bases:b,runs,complete:true,note:'3B scores; hitter out'}}
 return{outsAdded:1,bases:b,runs,complete:true,note:'Bases empty: hitter out'}
}
function dpFinal(s:GbState,leadOut:boolean,batterOut:boolean,leadBase:'2B'|'3B'):GbResult{const b=clone(s.bases);let runs=0;const r1=b.first!,r2=b.second,r3=b.third;b.first=null;if(leadBase==='2B'){if(leadOut){/* r1 removed */}else b.second=r1;if(r2)b.third=r2;if(r3)runs++}else{b.second=r1;if(r2){if(leadOut){/* r2 removed */}else b.third=r2}if(r3)runs++}if(!batterOut)b.first=s.batter;return{outsAdded:Number(leadOut)+Number(batterOut),bases:b,runs,complete:true,note:`${leadBase} DP checks resolved`}}
export function resolveStandardDp(s:GbState,comboDef:number,firstRoll:number,secondRoll?:number):GbResult{
 if(!s.bases.first)throw new Error('Standard DP requires runner on 1B.')
 const lead=s.bases.first,leadOut=infieldCheckOut(firstRoll,comboDef,lead.baserunning??10)
 if(firstRoll===1)return dpFinal(s,false,false,'2B')
 if(firstRoll===20)return dpFinal(s,true,true,'2B')
 if(secondRoll==null)throw new Error('Second DP fielding roll required.')
 const batterOut=infieldCheckOut(secondRoll,comboDef,s.batter.baserunning??10)
 return dpFinal(s,leadOut,batterOut,'2B')
}
export function resolveThirdToFirstDp(s:GbState,comboDef:number,firstRoll:number,secondRoll?:number):GbResult{
 if(!s.bases.first||!s.bases.second)throw new Error('3B→1B DP requires runners on 1B and 2B.')
 const lead=s.bases.second,leadOut=infieldCheckOut(firstRoll,comboDef,lead.baserunning??10)
 if(firstRoll===1)return dpFinal(s,false,false,'3B')
 if(firstRoll===20)return dpFinal(s,true,true,'3B')
 if(secondRoll==null)throw new Error('Second DP fielding roll required.')
 const batterOut=infieldCheckOut(secondRoll,comboDef,s.batter.baserunning??10)
 return dpFinal(s,leadOut,batterOut,'3B')
}
export function resolveTriplePlay(s:GbState,roll1:number,roll2?:number,roll3?:number):GbResult{
 if(s.outs!==0||!s.bases.first||!s.bases.second)throw new Error('Triple play requires 0 outs and runners on 1B/2B.')
 const b=clone(s.bases),r1=b.first!,r2=b.second!,r3=b.third;let outs=0,runs=0;b.first=null;b.second=null
 const o1=infieldCheckOut(roll1,0,r2.baserunning??10);if(roll1===1){b.first=s.batter;b.second=r1;b.third=r2;return{outsAdded:0,bases:b,runs:0,complete:true,note:'TP roll 1: all safe'}}if(roll1===20)return{outsAdded:3,bases:{first:null,second:null,third:r3},runs:0,complete:true,note:'Automatic triple play'};if(!o1){b.first=s.batter;b.second=r1;b.third=r2;return{outsAdded:0,bases:b,runs:0,complete:true,note:'TP first check failed; subsequent runners safe'}}outs++
 if(roll2==null)throw new Error('TP second roll required.');const o2=infieldCheckOut(roll2,0,r1.baserunning??10);if(roll2===1||!o2){b.first=s.batter;b.second=r1;if(r3)runs++;return{outsAdded:outs,bases:b,runs,complete:true,note:'TP second check failed; batter safe'}}if(roll2===20)return{outsAdded:3,bases:{first:null,second:null,third:r3},runs:0,complete:true,note:'TP completed on second natural 20'};outs++
 if(roll3==null)throw new Error('TP third roll required.');const o3=infieldCheckOut(roll3,0,s.batter.baserunning??10);if(o3)outs++;else b.first=s.batter;if(r3&&outs<3)runs++;return{outsAdded:outs,bases:b,runs,complete:true,note:'TP sequence resolved'}
}
export function resolveContactPlay(s:GbState,fullDef:number,roll:number):GbResult{
 if(!s.infieldIn||!s.bases.third)throw new Error('Contact play requires INF IN and a runner on 3B.')
 const b=clone(s.bases),lead=b.third;const out=infieldCheckOut(roll,fullDef,lead.baserunning??10);let runs=0;b.third=null
 // all non-lead runners advance one; batter safe
 if(b.second)b.third=b.second;if(b.first)b.second=b.first;b.first=s.batter;if(!out)runs++
 return{outsAdded:out?1:0,bases:b,runs,complete:true,note:'Contact play resolved'}
}
