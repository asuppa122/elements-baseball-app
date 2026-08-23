/**
 * Pure Elements Rulebook math used by both production resolvers and the private
 * deterministic Scenario Runner. Keeping these rules in one place prevents the
 * test harness from silently re-implementing different baseball math.
 */
export type AdvancementFrom = '1B' | '2B' | '3B'
export type AdvancementTo = '2B' | '3B' | 'HOME'

export function extraBaseEffectiveBaserunning(baseBsr:number, from:AdvancementFrom, to:AdvancementTo, outs:number):number {
  let effective=baseBsr
  // Rulebook hit-advancement bonus: every qualifying extra-base attempt except 1B→3B.
  if (!(from==='1B' && to==='3B')) effective+=3
  // Separate two-out hit-advancement bonus. This NEVER applies to tag ups.
  if (outs===2) effective+=3
  return effective
}

export function tagUpEffectiveBaserunning(baseBsr:number):number { return baseBsr }
export function tagUpOutfieldBonus(from:AdvancementFrom,to:AdvancementTo):number { return from==='1B'&&to==='2B'?10:0 }
export function tagUpRtsThreshold(attempts:Array<{to:AdvancementTo}>):number {
  if (attempts.some(a=>a.to==='HOME')) return 11
  return 16
}

/** Fielding checks resolve natural 1/20 before the ordinary total-vs-target comparison. */
export function fieldingCheckIsOut(roll:number, defenseTotal:number, target:number):boolean {
  if (roll===1) return false
  if (roll===20) return true
  return defenseTotal>target
}

export function catcherStealCheckIsOut(roll:number, catcherFielding:number, sb:number, stealingHome=false):boolean {
  const total=roll+catcherFielding+(stealingHome?15:0)
  return fieldingCheckIsOut(roll,total,sb)
}

export function extraBaseRtsPasses(roll:number):boolean { return roll>=11 }
export function tagUpRtsPasses(roll:number,attempts:Array<{to:AdvancementTo}>):boolean { return roll>=tagUpRtsThreshold(attempts) }
