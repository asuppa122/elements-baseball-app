export type PitcherFatigueInput = {
  printedControl: number | null
  useDefaultAttributes?: boolean
  gamesFromRested?: number
  cardIp: number | null
  outsRecorded: number
  earnedRunsAllowed: number
  inheritedRunnersScored?: number
  shutoutBrokenAfterBonus?: boolean
  shutoutBonusBrokenAtOuts?: number
  /** Rules v2: appearance outs at which an inherited runner scoring ended the bonus (Option B). */
  shutoutBonusEndedAtOuts?: number
  /** Rules version of the game (rulesVersion.ts); absent = 1. */
  rulesVersion?: number
}

function clampPitcherControl(value:number){ return Math.max(-5,value) }
export function effectiveHitterOnBase(printed:number|null,gamesFromRested=0,useDefault=false){
  if(useDefault || printed===null) return 5
  return Math.max(5,printed-Math.max(0,gamesFromRested))
}
export function performanceControlPenalty(earnedRuns:number){
  if(earnedRuns>=10)return 15
  if(earnedRuns>=9)return 10
  if(earnedRuns>=8)return 6
  if(earnedRuns>=7)return 3
  if(earnedRuns>=4)return 1
  return 0
}
export function cardIpOuts(ip:number|null){
  if(ip===null || !Number.isFinite(ip) || ip<=0)return 0
  const whole=Math.floor(ip); const fraction=ip-whole
  // Card IP uses baseball thirds: .33 = one out, .67 = two outs.
  const extraOuts=fraction>=0.5?2:fraction>=0.3?1:fraction>=0.15?2:fraction>=0.05?1:0
  return whole*3+extraOuts
}
/**
 * True when the Shutout Bonus is the branch of distanceControlPenalty that
 * applies: the pitcher is at/past card IP while the shutout is still intact,
 * paying -1 per out (and never pushed below 0 by the bonus itself) instead of
 * the ordinary -2 per out for working past his card.
 *
 * Extracted so presentation can tell the *reward* apart from overwork without
 * restating the condition and drifting from it -- the Rulebook treats these as
 * different situations, and rendering both as "past IP" tells a manager his
 * pitcher is in trouble when he has in fact earned the right to stay in.
 * distanceControlPenalty below is the only other caller.
 */
export function shutoutBonusApplies(input:PitcherFatigueInput){
  if(input.useDefaultAttributes)return false
  // Once the bonus has been broken by a run, the broken branch owns the result.
  if(input.shutoutBonusBrokenAtOuts!==undefined)return false
  const limit=cardIpOuts(input.cardIp)
  return input.outsRecorded>=15 && input.earnedRunsAllowed===0 && (input.inheritedRunnersScored??0)===0 && !input.shutoutBrokenAfterBonus && input.outsRecorded>=limit
}
/**
 * Rules v2 distance penalty, walked out by out so nothing already charged is
 * ever given back (Anthony, 2026-11-01; D10):
 * - ordinary: -2 for the out that completes card IP and every out after it;
 * - Shutout Bonus (from the later of that out and the 15th, while eligible):
 *   -1 per out, but only while Control is above 0 -- a pitcher already at 0
 *   or below stays where he is; reductions accrued before the bonus remain;
 * - a run charged to him ends the bonus: -2 at once, then -2 per later out;
 * - an inherited runner scoring ends it (Option B): no immediate -2, then -2
 *   per later out.
 * `base` is Control before any distance penalty with no earned run charged
 * (the bonus only applies while none is).
 */
function distanceControlPenaltyV2(input:PitcherFatigueInput){
  const limit=cardIpOuts(input.cardIp)
  const n=Math.max(0,input.outsRecorded)
  if(n===0||n<limit)return 0
  // No card IP (never on a real pitcher card): every out is past it, as in v1.
  if(limit===0)return (n+1)*2
  const base=clampPitcherControl((input.printedControl??-5)-Math.max(0,input.gamesFromRested??0))
  const bonusStart=Math.max(15,limit)
  const brokenAt=input.shutoutBonusBrokenAtOuts
  const endedAt=input.shutoutBonusEndedAtOuts
  const bonusEnd=brokenAt!==undefined&&endedAt!==undefined?Math.min(brokenAt,endedAt):brokenAt??endedAt
  // Without an explicit end, the bonus needs a clean line throughout.
  const eligible=bonusEnd!==undefined||(input.earnedRunsAllowed===0&&(input.inheritedRunnersScored??0)===0)
  let accrued=0
  for(let out=Math.max(1,limit);out<=n;out++){
    const bonusActive=eligible&&out>=bonusStart&&(bonusEnd===undefined||out<=bonusEnd)
    if(bonusActive){ if(base-accrued>0)accrued+=1 }
    else accrued+=2
    // The run that broke the bonus scored after this out: -2 at once.
    if(brokenAt!==undefined&&out===brokenAt&&(endedAt===undefined||brokenAt<=endedAt)&&eligible&&out>=bonusStart)accrued+=2
  }
  return accrued
}
export function distanceControlPenalty(input:PitcherFatigueInput){
  if(input.useDefaultAttributes)return 0
  if((input.rulesVersion??1)>=2)return distanceControlPenaltyV2(input)
  const limit=cardIpOuts(input.cardIp)
  // Distance fatigue begins on the out that completes the card-IP threshold: a
  // 6.67 IP pitcher (20 outs) pays his first penalty at out 20, because every
  // batter he faces after it is pitched beyond his card. Anthony's ruling after
  // the first live game (2026-10-30); it moves the Rulebook's "0.2 IP past" example
  // from -4 to -6, and is recorded as a Proposed Digital Gameplay Update.
  // Same counting for the -2 branch and the Shutout Bonus's -1 branch.
  const outsAtOrBeyond=input.outsRecorded>0?Math.max(0,input.outsRecorded-limit+1):0
  const baseBeforeDistance=clampPitcherControl((input.printedControl??-5)-Math.max(0,input.gamesFromRested??0)-performanceControlPenalty(input.earnedRunsAllowed))
  const brokenAt=input.shutoutBonusBrokenAtOuts
  if(brokenAt!==undefined){
    // Once a pitcher who had the Shutout Bonus allows an earned run while at/over card IP,
    // preserve the -1/out bonus fatigue already accrued, apply the immediate -2, then -2/out thereafter.
    const bonusOutsAtOrBeyond=Math.max(0,brokenAt-limit+1)
    const bonusPenalty=Math.min(bonusOutsAtOrBeyond,Math.max(0,baseBeforeDistance))
    const subsequentOuts=Math.max(0,input.outsRecorded-brokenAt)
    return bonusPenalty+2+(subsequentOuts*2)
  }
  if(shutoutBonusApplies(input)){
    // Shutout Bonus: the threshold-completing out is the first -1, then -1 for every later out.
    // The bonus cannot by itself push Control below 0.
    return Math.min(outsAtOrBeyond,Math.max(0,baseBeforeDistance))
  }
  return outsAtOrBeyond*2
}
export function effectivePitcherControl(input:PitcherFatigueInput){
  if(input.useDefaultAttributes || input.printedControl===null)return -5
  const pre=Math.max(0,input.gamesFromRested??0)
  const performance=performanceControlPenalty(input.earnedRunsAllowed)
  const distance=distanceControlPenalty(input)
  return clampPitcherControl(input.printedControl-pre-performance-distance)
}
export function reliefDistanceRestPenalty(cardIp:number|null,outsRecorded:number){
  return outsRecorded>3 && outsRecorded>cardIpOuts(cardIp) ? 1 : 0
}
export function postGameRestGames(args:{gamesFromRested:number;cardFatigue:number|null;appeared:boolean;defaultAttributes?:boolean;relief?:boolean;cardIp?:number|null;outsRecorded?:number;minimumBattersRetired?:boolean;backToBack?:boolean;pitchedAtNegativeControl?:boolean;startedAtControlOneOrHigher?:boolean}){
  if(!args.appeared || args.defaultAttributes)return Math.max(0,args.gamesFromRested)
  let total=Math.max(0,args.gamesFromRested)+Math.max(0,args.cardFatigue??0)
  if(args.relief) total+=reliefDistanceRestPenalty(args.cardIp??null,args.outsRecorded??0)
  if(args.minimumBattersRetired && !args.backToBack) total=Math.max(0,total-1)
  if(args.startedAtControlOneOrHigher && args.pitchedAtNegativeControl) total+=1
  return total
}
