import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import GameplayRuleDemo from '../components/GameplayRuleDemo'
import { GAMEPLAY_DEMO_SCENARIOS } from '../gameplay/gameplayDemoScenarios'
import { runRulebookCoverage } from '../gameplay/rulebookCoverage'

export default function GameplayVerificationPage(){
  const [selected,setSelected]=useState(GAMEPLAY_DEMO_SCENARIOS[0].id)
  const [ran,setRan]=useState(false)
  const report=useMemo(()=>runRulebookCoverage(),[])
  const current=GAMEPLAY_DEMO_SCENARIOS.find((item)=>item.id===selected)??GAMEPLAY_DEMO_SCENARIOS[0]

  return <main className="gameplay-verification-page">
    <section className="gameplay-verification-hero">
      <div><span>PRIVATE DEVELOPER VALIDATION</span><h1>Rulebook Coverage Registry</h1><p>Deterministic rule proof first. Interaction and UI verification second. Complete games are reserved for integration discovery, not as a substitute for branch coverage.</p></div>
      <div className="verification-score"><small>Runnable branch checks</small><strong>{ran?`${report.passed}/${report.total}`:'—'}</strong><button type="button" onClick={()=>setRan(true)}>Run Coverage</button></div>
    </section>

    <section className="verification-layer-grid">
      {Object.entries(report.layers).map(([layer,value])=><article key={layer}><span>{value.status}</span><strong>{layer.replaceAll('_',' ')}</strong><p>{value.description}</p></article>)}
    </section>

    {ran&&<section className="verification-coverage-table">
      <header><div><span>MEANINGFUL COVERAGE</span><h2>Rule branches by mechanic</h2></div><strong>{report.failed===0?'ALL RUNNABLE CASES PASS':`${report.failed} FAILURES`}</strong></header>
      <div className="verification-mechanic-grid">{report.mechanics.map((item)=><article key={item.mechanic} className={item.passed===item.total?'pass':'fail'}><strong>{item.mechanic}</strong><b>{item.passed}/{item.total}</b><small>{item.total-item.passed===0?'passing branches':`${item.total-item.passed} failing branch(es)`}</small></article>)}</div>
      {report.failed>0&&<div className="verification-failures">{report.cases.filter((item)=>!item.passed).map((item)=><article key={`${item.source}-${item.id}`}><strong>{item.id}</strong><span>{item.mechanic} · Rulebook {item.ruleSection}</span><p>{item.description}</p><code>{item.detail}</code></article>)}</div>}
    </section>}

    <section className="verification-workspace">
      <aside><span>Interactive + Rules demos</span>{GAMEPLAY_DEMO_SCENARIOS.map((scenario,index)=><button type="button" className={selected===scenario.id?'active':''} onClick={()=>setSelected(scenario.id)} key={scenario.id}><i>{String(index+1).padStart(2,'0')}</i><strong>{scenario.shortLabel}</strong><small>{scenario.category}</small></button>)}</aside>
      <div><GameplayRuleDemo scenario={current}/><div className="verification-contract"><strong>Expected Rulebook behavior</strong><p>{current.expected}</p></div></div>
    </section>

    <section className="verification-next-layer"><div><strong>Next evidence layer</strong><p>Once targeted branches pass, use the playable shell for manager experience and complete games for unexpected interactions. Large simulation counts should only be used when they answer a specific integration or statistical question.</p></div><div className="verification-next-actions"><Link to="/rules">Open Rules Demos</Link><Link to="/games">Open Games</Link></div></section>
  </main>
}
