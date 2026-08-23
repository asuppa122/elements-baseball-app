export type PitcherFatigueInput = {
  printedControl: number | null
  useDefaultAttributes?: boolean
  gamesFromRested?: number
  cardIp: number | null
  outsRecorded: number
  earnedRunsAllowed: number
  inheritedRunnersScored?: number
  shutoutBrokenAfterBonus?: boolean
}

export function clampPitcherControl(value:number){ return Math.max(-5,value) }
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
  const whole=Math.floor(ip); const decimal=Math.round((ip-whole)*10)
  return whole*3 + Math.min(2,Math.max(0,decimal))
}
export function distanceControlPenalty(input:PitcherFatigueInput){
  if(input.useDefaultAttributes)return 0
  const limit=cardIpOuts(input.cardIp)
  const beyond=Math.max(0,input.outsRecorded-limit)
  if(!beyond)return 0
  const shutoutEligible=input.outsRecorded>=15 && input.earnedRunsAllowed===0 && (input.inheritedRunnersScored??0)===0 && !input.shutoutBrokenAfterBonus
  if(!shutoutEligible)return beyond*2
  // Shutout Bonus: -1/out beyond IP, but it cannot by itself push Control below 0.
  const base=clampPitcherControl((input.printedControl??-5)-Math.max(0,input.gamesFromRested??0)-performanceControlPenalty(input.earnedRunsAllowed))
  return Math.min(beyond,Math.max(0,base))
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
