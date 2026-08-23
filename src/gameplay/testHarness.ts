import { resolvePitchRoll, resolveSwingRoll } from './engine'
import { getCoreChartCoverageIssues, resolveForDevelopmentHarness, resolveSwingChart } from './coreGame'
import { beginPrePitchDecision, confirmManagerDecision, getDecisionView, getPrePitchActions, resolveDecisionRoll } from './decisionEngine'
import type { BaseRunnerState, GameState } from './types'

export type HarnessReport = {
  seed:number
  completed:boolean
  finalInning:number
  finalHalf:string
  score:{away:number;home:number}
  plateAppearances:number
  halfInnings:number
  maxInning:number
  invalidStates:string[]
  invariants: Array<{name:string;passed:boolean;detail:string}>
  log:string[]
}

function rng(seed:number) {
  let x=seed>>>0
  return () => {
    x=(1664525*x+1013904223)>>>0
    return (x/4294967296)
  }
}

function d20(next:()=>number) { return Math.floor(next()*20)+1 }

function certificationStateLine(state:GameState,label:string):string {
  const side=state.half==='top'?'away':'home'
  const cursor=state.lineupCursor[side]
  const batter=state.plateAppearance.batterCardKey??'—'
  const base=(r:BaseRunnerState|null)=>r?`${r.playerName} [${r.cardKey}]`:'—'
  return `${label} · ${state.half} ${state.inning} · outs ${state.outs} · cursor ${cursor} · batter ${batter} · 1B ${base(state.bases.first)} · 2B ${base(state.bases.second)} · 3B ${base(state.bases.third)} · ${state.status}/${state.waitingFor}${state.pendingDecision?` · decision ${state.pendingDecision.decisionType}`:''}`
}

function validate(state:GameState): string[] {
  const issues:string[]=[]
  const occupied=[state.bases.first,state.bases.second,state.bases.third].filter(Boolean)
  const keys=occupied.map(r=>r!.cardKey)
  if (new Set(keys).size!==keys.length) { const detail=[['1B',state.bases.first],['2B',state.bases.second],['3B',state.bases.third]].filter(([,r])=>Boolean(r)).map(([base,r])=>`${base}=${(r as BaseRunnerState).playerName} [${(r as BaseRunnerState).cardKey}]`).join(' | '); issues.push(`Duplicate runner at ${state.half} ${state.inning}: ${detail}`) }
  const batterKey=state.plateAppearance.batterCardKey
  // A batter who just reached base may legitimately remain the plateAppearance batter
  // while a post-PA manager decision (extra bases, etc.) is being resolved. This
  // invariant is only illegal once the engine has returned to the next PITCH_ROLL.
  if(state.status==='in_progress'&&state.waitingFor==='PITCH_ROLL'&&batterKey&&keys.includes(batterKey)) issues.push(`Current batter is already an active baserunner at ${state.half} ${state.inning}: ${batterKey}`)
  for(const side of ['away','home'] as const){const order=state.pregame[side].battingOrderCardKeys;if(new Set(order).size!==order.length)issues.push(`Duplicate batting-order card for ${side}: ${order.join(' | ')}`)}
  if (state.outs<0 || state.outs>3) issues.push(`Invalid outs ${state.outs}`)
  if (state.score.home<0 || state.score.away<0) issues.push('Negative score')
  if (state.lineupCursor.home<0 || state.lineupCursor.home>8 || state.lineupCursor.away<0 || state.lineupCursor.away>8) issues.push('Invalid lineup cursor')
  return issues
}

/**
 * PRIVATE DEV HARNESS ONLY — never a manager gameplay feature.
 * It runs on a cloned state and never writes to Supabase. Advanced Build-2 decisions
 * use explicit test policies: decline optional extra bases/tag-ups; 1B+ skips its
 * automatic steal; unresolved GB branches use one conservative out.
 */
export function runCoreGameHarness(initial:GameState, seed=1925, maxPlateAppearances=500):HarnessReport {
  let state=structuredClone(initial)
  const next=rng(seed)
  const log:string[]=[]
  const invalidStates:string[]=[]
  const chartIssues = getCoreChartCoverageIssues(state)
  for (const issue of chartIssues) {
    const details = [
      issue.missingRolls.length ? `missing ${issue.missingRolls.join(',')}` : '',
      issue.overlaps.length ? `overlap ${issue.overlaps.join(',')}` : '',
    ].filter(Boolean).join('; ')
    invalidStates.push(`CHART COVERAGE: ${issue.label} — ${details} — ${JSON.stringify(issue.chart)}`)
  }
  if (chartIssues.length > 0) {
    return {
      seed, completed:false, finalInning:state.inning, finalHalf:state.half,
      score:structuredClone(state.score), plateAppearances:0, halfInnings:0,
      maxInning:state.inning, invalidStates, invariants:[{name:'Chart coverage',passed:false,detail:`${chartIssues.length} frozen chart issue(s)`}], log:['Validation stopped before simulation because one or more frozen charts do not cover d20 rolls 1-20 exactly once.'],
    }
  }
  let pa=0
  let halfInnings=0
  let previousHalf=`${state.inning}-${state.half}`
  let sawOutsOverThree=false
  let sawNegativeOuts=false
  let sawDuplicateRunner=false
  let sawInvalidCursor=false
  let plateAppearancesAfterComplete=0

  while (state.status!=='complete' && pa<maxPlateAppearances) {
    if (state.status==='paused') throw new Error('Resume the game before running the local validation harness.')
    if (state.waitingFor==='PITCH_ROLL') {
      const batterSide=state.half==='top'?'away':'home'
      const pitcherSide=state.half==='top'?'home':'away'
      const batterKey=state.plateAppearance.batterCardKey
      const pitcherKey=state.plateAppearance.pitcherCardKey
      const batter=batterKey?state.pregame[batterSide].roster?.cards[batterKey]:null
      const pitcher=pitcherKey?state.pregame[pitcherSide].roster?.cards[pitcherKey]:null
      const pr=d20(next)
      state=resolvePitchRoll(state,pr)
      const sr=d20(next)
      const before={inning:state.inning,half:state.half,outs:state.outs,away:state.score.away,home:state.score.home}
      const advantage=state.plateAppearance.advantage
      const result=resolveSwingChart(state,sr)
      state=resolveSwingRoll(state,sr)
      const decision=state.pendingDecision?.decisionType ?? null
      if (state.status==='awaiting_decision') state=resolveForDevelopmentHarness(state)
      pa++
      log.push(`${before.half==='top'?'Top':'Bot'} ${before.inning} | ${batter?.playerName??'?'} vs ${pitcher?.playerName??'?'} | P ${pr} → ${advantage??'—'} | S ${sr} → ${result??'resolved'}${decision?` | TEST POLICY: ${decision}`:''} | ${before.away}-${before.home} → ${state.score.away}-${state.score.home}`)
    } else if (state.status==='awaiting_decision') {
      state=resolveForDevelopmentHarness(state)
    } else {
      throw new Error(`Harness stopped at unsupported state: ${state.status} / ${state.waitingFor}`)
    }

    const stepIssues = validate(state)
    invalidStates.push(...stepIssues)
    if (state.outs > 3) sawOutsOverThree = true
    if (state.outs < 0) sawNegativeOuts = true
    if (stepIssues.some((issue) => issue.startsWith('Duplicate runner'))) sawDuplicateRunner = true
    if (stepIssues.some((issue) => issue.startsWith('Invalid lineup cursor'))) sawInvalidCursor = true
    if (state.status === 'complete' && state.waitingFor !== 'GAME_COMPLETE') invalidStates.push('Completed game is not in GAME_COMPLETE waiting state')
    const currentHalf=`${state.inning}-${state.half}`
    if (currentHalf!==previousHalf) { halfInnings++; previousHalf=currentHalf }
  }

  const completed = state.status === 'complete'
  const nonTieFinal = state.score.home !== state.score.away
  const gameEndedLegally = !completed || (state.inning >= 9 && nonTieFinal)
  const finalStateResolved = completed && state.pendingDecision === null && state.nextActor === null && state.waitingFor === 'GAME_COMPLETE'
  const invariants = [
    { name:'Game completed', passed:completed, detail:completed ? `${state.half} ${state.inning}, ${state.score.away}-${state.score.home}` : `Stopped after ${pa} PA` },
    { name:'Final score is not tied', passed:!completed || nonTieFinal, detail:`Away ${state.score.away} / Home ${state.score.home}` },
    { name:'Regulation/extra-inning ending', passed:gameEndedLegally, detail:`Ended in inning ${state.inning}` },
    { name:'No fourth out', passed:!sawOutsOverThree, detail:'Outs remained within 0-3' },
    { name:'No negative outs', passed:!sawNegativeOuts, detail:'Outs never fell below 0' },
    { name:'No duplicate baserunners', passed:!sawDuplicateRunner, detail:'A card never occupied multiple bases at once' },
    { name:'Lineup cursors remained legal', passed:!sawInvalidCursor, detail:'Home/away cursor stayed between 0 and 8' },
    { name:'Final authoritative state resolved', passed:!completed || finalStateResolved, detail:completed ? `${state.waitingFor}, pending decision ${state.pendingDecision ? 'present' : 'none'}` : 'Game not completed' },
    { name:'No PA after completion', passed:plateAppearancesAfterComplete===0, detail:`${plateAppearancesAfterComplete} PA after complete` },
    { name:'Validation state errors', passed:invalidStates.length===0, detail:`${invalidStates.length} structural error(s)` },
  ]

  return {
    seed,
    completed,
    finalInning:state.inning,
    finalHalf:state.half,
    score:structuredClone(state.score),
    plateAppearances:pa,
    halfInnings,
    maxInning:state.inning,
    invalidStates:[...new Set(invalidStates)],
    invariants,
    log,
  }
}


export type DecisionStressReport = {
  seed:number
  simulations:number
  completed:number
  failed:number
  totalPlateAppearances:number
  decisionCounts:Record<string,number>
  bypassCounts:Record<string,number>
  invalidStates:string[]
  sampleLogs:string[]
}

function numberFromDetail(detail:string,label:string):number|null {
  const match=detail.match(new RegExp(`${label}\\s+(-?\\d+)`,'i'))
  return match ? Number(match[1]) : null
}

function botSelection(state:GameState, next:()=>number):string[] {
  const d=state.pendingDecision
  const view=getDecisionView(state)
  if(!d || !view || view.mode==='roll' || view.mode==='information') return []
  if(view.mode==='multi_runner') return view.options.map(o=>o.id)
  if(d.decisionType==='EXTRA_BASE_DECISION') return ['ATTEMPT_EXTRA_BASES']
  if(d.decisionType==='TAG_UP_DECISION') return ['ATTEMPT_TAG_UP']
  if(d.decisionType==='EXTRA_BASE_DEFENSE_TARGET' || d.decisionType==='NATURAL_STEAL_DEFENSE_TARGET') {
    const ranked=[...view.options].sort((a,b)=>(numberFromDetail(a.detail,'BSR')??99)-(numberFromDetail(b.detail,'BSR')??99))
    return ranked[0] ? [ranked[0].id] : []
  }
  if(d.decisionType==='TAG_UP_DEFENSE_SELECTION' || d.decisionType==='OUTFIELD_SELECTION') {
    const ranked=[...view.options].sort((a,b)=>(numberFromDetail(b.detail,'DEF')??-99)-(numberFromDetail(a.detail,'DEF')??-99))
    return ranked[0] ? [ranked[0].id] : []
  }
  return view.options.length ? [view.options[Math.floor(next()*view.options.length)].id] : []
}

function maybeBotPrePitchAction(state:GameState,next:()=>number):GameState {
  const actions=getPrePitchActions(state)
  if(!actions.length) return state
  const byId=new Map(actions.map(a=>[a.id,a]))
  const r=next()
  let id:string|null=null
  if(byId.has('NATURAL_STEAL') && r<0.14) id='NATURAL_STEAL'
  else if(byId.has('SAC_BUNT') && r<0.19) id='SAC_BUNT'
  else if(byId.has('SQUEEZE_BUNT') && r<0.23) id='SQUEEZE_BUNT'
  else if(byId.has('INFIELD_IN') && r<0.27) id='INFIELD_IN'
  else if(byId.has('INTENTIONAL_WALK') && r<0.31) id='INTENTIONAL_WALK'
  else if(byId.has('PINCH_HITTER') && r<0.34) id='PINCH_HITTER'
  else if(byId.has('PINCH_RUNNER') && r<0.37) id='PINCH_RUNNER'
  else if(byId.has('PITCHING_CHANGE') && r<0.40) id='PITCHING_CHANGE'
  else if(byId.has('DEFENSIVE_SUB') && r<0.43) id='DEFENSIVE_SUB'
  return id?beginPrePitchDecision(state,id):state
}

function describeDecisionRoll(before:GameState, roll:number, after:GameState):string {
  const d=before.pendingDecision
  if(!d) return `Decision roll ${roll}`
  if(d.decisionType==='EXTRA_BASE_RTS') {
    const target=d.context.target as {to?:string;runner?:{playerName?:string}}|undefined
    const skip=before.outs===2 && target?.to==='HOME'
    return `EXTRA_BASE_RTS · ${target?.runner?.playerName??'runner'} · roll ${roll} · ${skip?'Rulebook RTS skip (2 outs / throw home)':roll>=11?'PASS (11+)':'FAIL (1-10)'} · next ${after.pendingDecision?.decisionType??after.waitingFor}`
  }
  if(d.decisionType==='TAG_UP_RTS') {
    const attempts=(d.context.attempts as Array<{to?:string}>|undefined)??[]
    const threshold=attempts.some(a=>a.to==='HOME')?11:16
    return `TAG_UP_RTS · roll ${roll} · required ${threshold}+ · ${roll>=threshold?'PASS':'FAIL'} · next ${after.pendingDecision?.decisionType??after.waitingFor}`
  }
  if(d.decisionType==='OUTFIELD_FIELDING_ROLL') {
    const target=d.context.target as {from?:string;to?:string;runner?:{playerName?:string;baserunning?:number|null}}|undefined
    const pos=String(d.context.outfielder??'?')
    const side=d.actingSide
    const key=before.pregame[side].defensiveAlignment[pos as 'LF'|'CF'|'RF']
    const card=key?before.pregame[side].roster?.cards[key]:null
    const baseDef=card?.defense[pos as 'LF'|'CF'|'RF']??0
    const bonus=d.context.tagOneToTwo===true?10:0
    let effectiveBsr=target?.runner?.baserunning??10
    const kind=String(d.context.kind??'')
    if(kind==='EXTRA_BASE' && !(target?.from==='1B'&&target?.to==='3B')) effectiveBsr+=3
    if(kind==='EXTRA_BASE' && before.outs===2) effectiveBsr+=3
    const total=roll+baseDef+bonus
    const isOut=roll===20?true:roll===1?false:total>effectiveBsr
    return `OF_FIELDING · ${pos} ${card?.playerName??''} · DEF ${baseDef}${bonus?` +${bonus}`:''} · roll ${roll} = ${total} vs BSR ${effectiveBsr} · ${isOut?'OUT':'SAFE'}`
  }
  if(d.decisionType==='ONE_BASE_PLUS_STOLEN_BASE' || d.decisionType==='CATCHER_FIELDING_ROLL') {
    const target=(d.context.target as {stolenBase?:number|null;playerName?:string;runner?:{stolenBase?:number|null;playerName?:string}}|undefined)
    const runner=target?.runner??target
    return `${d.decisionType} · ${runner?.playerName??'runner'} · roll ${roll} · SB ${runner?.stolenBase??10} · next ${after.pendingDecision?.decisionType??after.waitingFor}`
  }
  if(d.decisionType==='SAC_BUNT_RTS' || d.decisionType==='SAC_BUNT_WHEEL_RTS' || d.decisionType==='SQUEEZE_BUNT_ROLL') return `${d.decisionType} · roll ${roll} · next ${after.pendingDecision?.decisionType??after.waitingFor}`
  return `${d.decisionType} · roll ${roll} · next ${after.pendingDecision?.decisionType??after.waitingFor}`
}

/**
 * PRIVATE DEV RULES BOT — local clones only, never writes to Supabase.
 * Uses the real manager-decision API for every supported branch. Certification has
 * zero development bypasses: any unresolved information-only decision is a hard failure.
 */
export function runDecisionStressHarness(initial:GameState, seed=1925, simulations=100, maxPlateAppearances=500):DecisionStressReport {
  const master=rng(seed)
  const decisionCounts:Record<string,number>={}
  const bypassCounts:Record<string,number>={}
  const invalidStates:string[]=[]
  const sampleLogs:string[]=[]
  let completed=0,failed=0,totalPlateAppearances=0

  for(let sim=0;sim<simulations;sim++) {
    let state=structuredClone(initial)
    const simSeed=Math.floor(master()*0xffffffff)>>>0
    const next=rng(simSeed)
    let pa=0
    const trace:string[]=[]
    const pushTrace=(line:string)=>{trace.push(line);if(trace.length>80)trace.shift()}
    try {
      while(state.status!=='complete' && pa<maxPlateAppearances) {
        pushTrace(certificationStateLine(state,`PA ${pa+1} BEFORE`))
        if(state.status==='paused') throw new Error('State is paused.')
        if(state.waitingFor==='PITCH_ROLL') {
          const maybe=maybeBotPrePitchAction(state,next)
          if(maybe.status==='awaiting_decision'){ state=maybe; continue }
          state=resolvePitchRoll(maybe,d20(next))
          const swing=d20(next)
          state=resolveSwingRoll(state,swing)
          pa++
        } else if(state.status==='in_progress' && state.waitingFor==='SWING_ROLL') {
          // Some Rulebook decisions (for example a failed sac-bunt possibility) intentionally
          // return the current PA directly to Swing Roll on the already-selected chart.
          state=resolveSwingRoll(state,d20(next))
          pa++
        } else if(state.status==='awaiting_decision') {
          const d=state.pendingDecision
          if(!d) throw new Error('Awaiting decision with no pending decision.')
          decisionCounts[d.decisionType]=(decisionCounts[d.decisionType]??0)+1
          const view=getDecisionView(state)
          if(!view) throw new Error(`No view for ${d.decisionType}.`)
          if(view.mode==='information') {
            throw new Error(`Unsupported Rules Bot decision ${d.decisionType}; certification requires zero bypasses.`)
          } else if(view.mode==='roll') {
            const before=state
            const roll=d20(next)
            state=resolveDecisionRoll(state,roll)
            if(sampleLogs.length<80) sampleLogs.push(`SIM ${sim+1} · ${describeDecisionRoll(before,roll,state)}`)
          } else {
            const ids=botSelection(state,next)
            if(!ids.length) throw new Error(`Rules Bot found no legal selection for ${d.decisionType}.`)
            state=confirmManagerDecision(state,ids)
            if(sampleLogs.length<80) sampleLogs.push(`SIM ${sim+1} · ${d.decisionType} · SELECT ${ids.join(' | ')} · next ${state.pendingDecision?.decisionType??state.waitingFor}`)
          }
        } else {
          throw new Error(`Unsupported state ${state.status}/${state.waitingFor}`)
        }
        pushTrace(certificationStateLine(state,`PA ${pa} AFTER`))
        const issues=validate(state)
        if(issues.length) throw new Error(`${issues.join('; ')}\nTRACE seed ${simSeed}:\n${trace.join('\n')}`)
      }
      totalPlateAppearances+=pa
      if(state.status==='complete') completed++
      else { failed++; invalidStates.push(`SIM ${sim+1} seed ${simSeed}: did not complete within ${maxPlateAppearances} PA`) }
    } catch(e) {
      failed++
      totalPlateAppearances+=pa
      invalidStates.push(`SIM ${sim+1} seed ${simSeed}: ${e instanceof Error?e.message:String(e)}`)
    }
  }

  return {seed,simulations,completed,failed,totalPlateAppearances,decisionCounts,bypassCounts,invalidStates:[...new Set(invalidStates)],sampleLogs}
}
