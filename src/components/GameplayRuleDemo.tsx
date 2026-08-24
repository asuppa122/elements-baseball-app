import { useEffect, useMemo, useState } from 'react'
import type { GameplayDemoScenario } from '../gameplay/gameplayDemoScenarios'

type Props={scenario:GameplayDemoScenario; compact?:boolean; autoplay?:boolean}

export default function GameplayRuleDemo({scenario,compact=false,autoplay=false}:Props){
  const result=useMemo(()=>scenario.evaluate(),[scenario])
  const [step,setStep]=useState(0)
  const [playing,setPlaying]=useState(autoplay)

  useEffect(()=>{setStep(0);setPlaying(autoplay)},[scenario.id,autoplay])
  useEffect(()=>{
    if(!playing)return
    const timer=window.setInterval(()=>setStep((current)=>current>=scenario.steps.length-1?0:current+1),1500)
    return()=>window.clearInterval(timer)
  },[playing,scenario.steps.length])

  const visibleSteps=compact?scenario.steps.slice(0,Math.max(1,step+1)):scenario.steps

  return <article className={`gameplay-rule-demo ${compact?'compact':''}`} data-demo-id={scenario.id}>
    <header>
      <div><span>{scenario.category} · Rulebook {scenario.ruleSection}</span><h3>{scenario.title}</h3></div>
      <strong className={result.passed?'demo-pass':'demo-fail'}>{result.passed?'PASS':'CHECK'}</strong>
    </header>
    <div className="gameplay-rule-demo-stage" aria-live="polite">
      <div className="demo-setup"><small>Situation</small><p>{scenario.setup}</p></div>
      <div className="demo-sequence">
        {visibleSteps.map((item,index)=><div className={`demo-step ${index===step?'active':''} ${item.tone??''}`} key={`${scenario.id}-${index}`}>
          <span>{index+1}</span><div><strong>{item.label}</strong><p>{item.detail}</p></div>
        </div>)}
      </div>
      <div className="demo-result"><small>Engine verification</small><strong>{result.headline}</strong><p>{result.detail}</p></div>
    </div>
    <footer>
      <button type="button" onClick={()=>{setPlaying(false);setStep((step+1)%scenario.steps.length)}}>Next Step</button>
      <button type="button" onClick={()=>{setStep(0);setPlaying(true)}}>{playing?'Restart Loop':'Play Demo'}</button>
    </footer>
  </article>
}
