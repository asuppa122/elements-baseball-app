import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { MILESTONES_1925 } from '../data/milestones1925'
import { SEASON10_COMMUNITY, SEASON10_MANAGERS, SEASON10_TRACKING, type SeasonManager } from '../data/season10Tracking'

type Tab = 'standard' | 'consistency' | 'ladder' | 'community'
type Phase = 'negro' | 'mlb' | 'combined'

const TABS: Array<{ id: Tab; label: string; kicker: string }> = [
  { id: 'standard', label: 'Standard', kicker: 'Season GP' },
  { id: 'consistency', label: 'Consistency', kicker: 'Weeks played' },
  { id: 'ladder', label: 'Ladder', kicker: 'Total games' },
  { id: 'community', label: 'Community', kicker: 'League-wide' },
]
const PHASES: Array<{ id: Phase; label: string; weeks: string; subtitle: string; short: string }> = [
  { id: 'negro', label: 'Phase 1', weeks: 'Weeks 1–6', subtitle: '1925 Negro Leagues Only', short: 'Negro Leagues' },
  { id: 'mlb', label: 'Phase 2', weeks: 'Weeks 7–12', subtitle: '1925 MLB Only', short: 'MLB Only' },
  { id: 'combined', label: 'Phase 3', weeks: 'Weeks 13–26', subtitle: '1925 Combined', short: 'Combined' },
]
const CATEGORY_COPY: Record<Tab, { eyebrow: string; description: string }> = {
  standard: { eyebrow: 'Season Progression', description: '' },
  consistency: { eyebrow: 'Weekly Progression', description: '' },
  ladder: { eyebrow: 'Season Ladder', description: 'Continuing rewards based on total Season 10 games played, independent of phase.' },
  community: { eyebrow: 'League Progression', description: 'Shared milestones based on manager participation thresholds and total league games.' },
}

function parseThreshold(text:string) { return Number(text.match(/^\d+/)?.[0] ?? 0) }
function isMajorThreshold(target:number) { return [50,100,200,300,500,1000].includes(target) }

function MilestoneGlyph({ type, compact=false }:{ type:Tab; compact?:boolean }) {
  const common={ viewBox:'0 0 64 64', 'aria-hidden':true, className:`milestone-glyph milestone-glyph-${type} ${compact?'compact':''}` } as const
  if (type==='standard') return <svg {...common}><path d="M13 10h5v43h-5z"/><path d="M18 13h30l-8 11 8 11H18z"/><circle cx="34" cy="24" r="7"/><path d="M31 18c3 2 5 5 6 9M38 19c-3 2-5 5-6 9"/></svg>
  if (type==='consistency') return <svg {...common}><rect x="10" y="14" width="44" height="38" rx="5"/><path d="M10 24h44M20 9v10M44 9v10"/><circle cx="32" cy="38" r="9"/><path d="M27 32c3 2 5 5 6 10M37 32c-3 2-5 5-6 10"/></svg>
  if (type==='ladder') return <svg {...common}><path d="M15 47h11v7H15zM27 38h11v16H27zM39 28h11v26H39z"/><path d="M22 12h20v8c0 8-4 13-10 13s-10-5-10-13z"/><path d="M22 16h-7c0 7 3 11 9 12M42 16h7c0 7-3 11-9 12M32 33v7"/></svg>
  return <svg {...common}><path d="M9 46c4-13 13-21 23-21s19 8 23 21"/><path d="M15 46h34M18 46v8M46 46v8"/><circle cx="22" cy="21" r="6"/><circle cx="42" cy="21" r="6"/><circle cx="32" cy="15" r="7"/><path d="M25 54h14"/></svg>
}


export default function MilestonesPage() {
  const { profile } = useAuth()
  const profileManager = SEASON10_MANAGERS.find(m => m.toLowerCase() === profile?.manager_name?.toLowerCase()) ?? 'Anthony'
  const [manager,setManager] = useState<SeasonManager>(profileManager)
  const [tab,setTab] = useState<Tab>('standard')
  const [phase,setPhase] = useState<Phase>('mlb')
  const tracker = SEASON10_TRACKING[manager]

  const rows = useMemo(() => tab === 'standard' ? MILESTONES_1925.standard[phase] : MILESTONES_1925[tab], [tab,phase])
  const activePhase = PHASES.find(p=>p.id===phase) ?? PHASES[0]
  const heading = tab==='standard' ? `${activePhase.short} Milestones` : `${TABS.find(t=>t.id===tab)?.label} Milestones`

  function progressFor(index:number, thresholdText:string) {
    const target=parseThreshold(thresholdText)
    if (tab==='standard') return { current:tracker.totalGames, target, unit:'Season 10.1 games' }
    if (tab==='consistency') return { current:0, target, unit:'weeks', unavailable:true }
    if (tab==='ladder') return { current:tracker.totalGames, target, unit:'games' }
    if (index===0) return { current:SEASON10_COMMUNITY.managersAt25,target:8,unit:'managers at 25 GP' }
    if (index===1) return { current:SEASON10_COMMUNITY.managersAt50,target:7,unit:'managers at 50 GP' }
    if (index===2) return { current:SEASON10_COMMUNITY.managersAt75,target:6,unit:'managers at 75 GP' }
    if (index===3) return { current:SEASON10_COMMUNITY.managersAt100,target:5,unit:'managers at 100 GP' }
    return { current:SEASON10_COMMUNITY.totalGames,target,unit:'league games' }
  }

  const nextAchievement = useMemo(() => {
    if (tab === 'consistency') return null
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const p = progressFor(index, row.threshold)
      if (!('unavailable' in p && p.unavailable) && p.current < p.target) {
        return { row, progress:p, index, remaining:Math.max(0,p.target-p.current) }
      }
    }
    return null
  }, [rows,tab,tracker.totalGames])

  const phaseState = (id:Phase) => id==='negro' ? 'complete' : id==='mlb' ? 'current' : 'upcoming'

  return <main className="league-content-page milestones-page milestones-page-v3">
    <section className="milestones-hero milestones-hero-v2">
      <div className="milestones-season-copy">
        <span className="league-eyebrow">Season Milestones</span>
        <h1>Season 10 <span>•</span> 1925</h1>
        <div className="milestones-manager-row">
          <label><span>Manager Tracker</span><select value={manager} onChange={e=>setManager(e.target.value as SeasonManager)}>{SEASON10_MANAGERS.map(m=><option key={m}>{m}</option>)}</select></label>
        </div>
      </div>
      <div className="milestones-phase-progress milestones-season-timeline" aria-label="Season 10 phases">{PHASES.map((item,index)=>{ const seasonState=phaseState(item.id); return <div className={`milestones-phase-step ${seasonState}`} key={item.id}><button type="button" className={phase===item.id?'milestones-phase-card active':'milestones-phase-card'} onClick={()=>{setPhase(item.id);setTab('standard')}}><span className="phase-label">{item.label}</span><strong>{item.weeks}</strong><em>{item.subtitle}</em></button>{index<PHASES.length-1&&<span className="milestones-phase-connector"><i /></span>}</div>})}</div>
    </section>

    <nav className="league-tab-row milestones-track-tabs milestones-track-tabs-v3" aria-label="Milestone categories">{TABS.map(item=><button type="button" className={tab===item.id?'active':''} onClick={()=>setTab(item.id)} key={item.id}><span className="milestone-tab-icon"><MilestoneGlyph type={item.id} compact /></span><span>{item.kicker}</span><strong>{item.label}</strong></button>)}</nav>

    {nextAchievement && <section className={`milestones-next-feature milestones-next-${tab}`}>
      <div className={`milestones-next-medallion crest-${tab}`}><MilestoneGlyph type={tab} /><span className="milestones-next-star">✦</span><small>Next</small></div>
      <div className="milestones-next-copy"><span className="league-eyebrow">Next Achievement</span><h2>{nextAchievement.progress.target} {nextAchievement.progress.unit}</h2><p><strong>Reward</strong> {nextAchievement.row.reward}</p></div>
      <div className="milestones-next-meter"><div><span>{nextAchievement.progress.current} / {nextAchievement.progress.target}</span><strong>{nextAchievement.remaining} remaining</strong></div><div className="milestones-feature-track"><span style={{width:`${Math.min(100,Math.round((nextAchievement.progress.current/nextAchievement.progress.target)*100))}%`}} /></div></div>
    </section>}

    {tab==='ladder' && <section className="milestones-ladder-map" aria-label="Ladder position"><div className="ladder-map-label"><span>Season Ladder</span><strong>You are here • {tracker.totalGames} GP</strong></div><div className="ladder-map-track">{MILESTONES_1925.ladder.slice(0,7).map((item,index)=>{const target=parseThreshold(item.threshold); const complete=tracker.totalGames>=target; const next=tracker.totalGames<target && (index===0 || tracker.totalGames>=parseThreshold(MILESTONES_1925.ladder[index-1].threshold)); return <span className={complete?'complete':next?'next':''} key={item.threshold}><i>{complete?'✓':target}</i><small>{target}</small></span>})}</div></section>}

    {tab==='consistency' && <section className="consistency-week-strip consistency-unconnected consistency-calendar-shell"><div><span>Consistency Tracking</span><strong>Workbook connection pending</strong></div><div className="consistency-week-markers">{Array.from({length:26},(_,i)=><span key={i}>W{i+1}</span>)}</div><p>Monday–Sunday progress will populate here once weekly participation is tracked in the workbook.</p></section>}

    {tab==='community' && <section className="community-scoreboard"><div><span>League Games</span><strong>{SEASON10_COMMUNITY.totalGames}</strong><small>toward shared milestones</small></div><div><span>25 GP Club</span><strong>{SEASON10_COMMUNITY.managersAt25}</strong><small>managers qualified</small></div><div><span>50 GP Club</span><strong>{SEASON10_COMMUNITY.managersAt50}</strong><small>managers qualified</small></div><div><span>100 GP Club</span><strong>{SEASON10_COMMUNITY.managersAt100}</strong><small>managers qualified</small></div></section>}

    <div className="milestones-layout milestones-layout-v2 milestones-layout-full"><section className={`milestones-list-panel milestones-progression-panel milestone-panel-${tab}`}><div className="league-panel-heading milestones-panel-heading"><div className="milestones-heading-lockup"><span className={`milestones-category-crest crest-${tab}`}><MilestoneGlyph type={tab} /></span><div><span>{CATEGORY_COPY[tab].eyebrow}</span><h2>{heading}</h2>{CATEGORY_COPY[tab].description && <p>{CATEGORY_COPY[tab].description}</p>}</div></div></div>
      <div className="milestone-grid-header" aria-hidden="true"><span>Milestone</span><span>Progress</span></div>
      <div className="milestone-track" role="list">{rows.map((row,index)=>{ const p=progressFor(index,row.threshold); const unavailable='unavailable' in p && p.unavailable; const complete=!unavailable && p.current>=p.target; const remaining=Math.max(0,p.target-p.current); const displayCurrent=unavailable?0:Math.min(p.current,p.target); const percent=unavailable?0:Math.min(100,Math.round((p.current/p.target)*100)); const firstIncomplete = !unavailable && !complete && rows.slice(0,index).every((prior,priorIndex)=>{ const pp=progressFor(priorIndex,prior.threshold); return !('unavailable' in pp && pp.unavailable) && pp.current>=pp.target }); const stateClass=complete?'is-complete':firstIncomplete?'is-next':'is-upcoming'; const major=isMajorThreshold(p.target); return <article className={`milestone-achievement ${stateClass} ${major?'is-major':''}`} role="listitem" key={`${tab}-${phase}-${row.threshold}-${index}`}>
        <div className="milestone-track-rail"><span className="milestone-node" aria-hidden="true" />{index<rows.length-1&&<span className="milestone-node-line"/>}</div>
        <div className="milestone-achievement-threshold"><div className={`milestone-plaque ${complete?'earned':firstIncomplete?'active':'locked'} ${major?'major':''}`}><strong>{parseThreshold(row.threshold)}</strong><span>{row.threshold.replace(/^\d+\s*/, '') || p.unit}</span>{major && <b>★</b>}</div></div>
        <div className="milestone-achievement-progress milestone-diamond-progress" aria-label="Progress">
          <div className="diamond-progress-copy"><span>{unavailable?'AWAITING TRACKER':complete?'ACHIEVED':firstIncomplete?'IN PROGRESS':'LOCKED'}</span><strong className="milestone-progress-reward">{row.reward}</strong><div className="milestone-inline-progress"><i style={{width:`${percent}%`}} /></div><div className="milestone-progress-footer">{!unavailable&&!complete&&<small>{remaining} TO GO</small>}</div></div>
          <div className={`progress-diamond ${complete?'complete':firstIncomplete?'active':'locked'}`} aria-label={complete?'Reward available to claim':firstIncomplete?`${displayCurrent} ${p.unit} current progress`:'Milestone locked'}>{complete?<strong className="diamond-state-label claim">CLAIM<br/>REWARD</strong>:firstIncomplete?<strong>{displayCurrent}</strong>:<strong className="diamond-state-label locked">LOCKED</strong>}</div>
        </div>
      </article>})}</div>
    </section></div>
  </main>
}
