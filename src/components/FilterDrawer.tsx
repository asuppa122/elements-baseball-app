import { useMemo, useState } from 'react'

export type OwnershipFilter = '' | 'owned-eligible' | 'owned-ineligible' | 'not-collected'
export type ChartMode = 'batting' | 'pitching'
export type AttributeFilter = '' | 'points' | 'hitter_fatigue' | 'hitter_on_base' | 'hitter_baserunning' | 'hitter_stolen_base' | 'pitcher_fatigue' | 'pitcher_control' | 'outs' | 'pitcher_ip' | 'k' | 'gb' | 'fb' | 'bb' | '1b' | '1b_plus' | '2b' | '3b' | 'hr'
export type AttributeOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'includes' | 'starts_at' | 'ends_at'
export type AttributeCondition = { id: string; attribute: AttributeFilter; operator: AttributeOperator; value: string }
export type SortField = 'card_number' | 'player_name' | 'team' | 'year' | 'points' | 'hitter_fatigue' | 'hitter_on_base' | 'hitter_outs' | 'hitter_baserunning' | 'hitter_stolen_base' | 'pitcher_fatigue' | 'pitcher_control' | 'pitcher_outs' | 'pitcher_ip' | 'k' | 'gb' | 'fb' | 'bb' | '1b' | '1b_plus' | '2b' | '3b' | 'hr' | 'defense'
export type SortDirection = 'asc' | 'desc'
export type DefensePosition = '' | 'c' | '1b' | '2b' | '3b' | 'ss' | 'lf' | 'cf' | 'rf'

type Props = {
  searchTerm:string; onSearchChange:(v:string)=>void
  yearFilter:string; onYearFilterChange:(v:string)=>void; yearOptions:number[]
  teamFilter:string; onTeamFilterChange:(v:string)=>void; teamOptions:string[]
  leagueFilter:string; onLeagueFilterChange:(v:string)=>void; leagueOptions:string[]
  positionFilter:string; onPositionFilterChange:(v:string)=>void
  ownershipFilter:OwnershipFilter; onOwnershipFilterChange:(v:OwnershipFilter)=>void
  batsFilter:string; onBatsFilterChange:(v:string)=>void
  throwsFilter:string; onThrowsFilterChange:(v:string)=>void
  chartMode:ChartMode; onChartModeChange:(v:ChartMode)=>void
  attributeConditions:AttributeCondition[]; onAttributeConditionsChange:(v:AttributeCondition[])=>void
  defensePosition:DefensePosition; onDefensePositionChange:(v:DefensePosition)=>void
  defenseRating:string; onDefenseRatingChange:(v:string)=>void
  sortField:SortField; onSortFieldChange:(v:SortField)=>void
  sortDirection:SortDirection; onSortDirectionChange:(v:SortDirection)=>void
  onClearFilters:()=>void
  hideOwnership?:boolean
  lockedYear?:string
}

const positions=[['','All'],['p','P'],['c','C'],['1b','1B'],['2b','2B'],['3b','3B'],['ss','SS'],['lf','LF'],['cf','CF'],['rf','RF'],['dh','DH']]
const operators=[['eq','='],['neq','≠'],['lt','<'],['lte','≤'],['gt','>'],['gte','≥']] as const
const batting:[AttributeFilter,string][]=[['hitter_on_base','On Base'],['hitter_fatigue','Ftg'],['hitter_baserunning','BsR'],['hitter_stolen_base','SB'],['outs','Outs'],['k','K'],['gb','GB'],['fb','FB'],['bb','BB'],['1b','1B'],['1b_plus','1B+'],['2b','2B'],['3b','3B'],['hr','HR']]
const pitching:[AttributeFilter,string][]=[['pitcher_control','Control'],['pitcher_ip','IP'],['pitcher_fatigue','Ftg'],['outs','Outs'],['k','K'],['gb','GB'],['fb','FB'],['bb','BB'],['1b','1B'],['2b','2B'],['3b','3B'],['hr','HR']]
const sortGeneral:[SortField,string][]=[['player_name','Name'],['year','Year'],['points','Points'],['defense','Defense']]

export default function FilterDrawer(p:Props){
 const [open,setOpen]=useState(false)
 const [adding,setAdding]=useState(false)
 const attrs=p.chartMode==='batting'?batting:pitching
 const active=useMemo(()=>[
  p.positionFilter&&`Position: ${p.positionFilter.toUpperCase()}`,
  (p.lockedYear || p.yearFilter)&&`Year: ${p.lockedYear || p.yearFilter}`,
  p.teamFilter&&`Team: ${p.teamFilter}`,
  p.leagueFilter&&`League: ${p.leagueFilter}`,
  p.batsFilter&&`Bats: ${p.batsFilter}`,
  p.throwsFilter&&`Throws: ${p.throwsFilter}`,
  p.ownershipFilter&&`Ownership: ${p.ownershipFilter}`,
  `${p.chartMode==='batting'?'Batting':'Pitching'} Chart`,
 ].filter(Boolean) as string[],[p.positionFilter,p.yearFilter,p.teamFilter,p.leagueFilter,p.batsFilter,p.throwsFilter,p.ownershipFilter,p.chartMode,p.lockedYear])
 const update=(id:string,changes:Partial<AttributeCondition>)=>p.onAttributeConditionsChange(p.attributeConditions.map(c=>c.id===id?{...c,...changes}:c))
 const remove=(id:string)=>p.onAttributeConditionsChange(p.attributeConditions.filter(c=>c.id!==id))
 const add=()=>{p.onAttributeConditionsChange([...p.attributeConditions,{id:`f-${Date.now()}`,attribute:'',operator:'eq',value:''}]);setAdding(true)}
 return <section className="universal-filter-shell">
  {!open ? <>
   <div className="uf-compact-toolbar">
    <label className="uf-compact-name"><span>Name</span><input value={p.searchTerm} onChange={e=>p.onSearchChange(e.target.value)} placeholder="Player name" /></label>
    <label><span>Sort By</span><select value={p.sortField} onChange={e=>p.onSortFieldChange(e.target.value as SortField)}>{sortGeneral.map(([v,l])=><option key={v} value={v}>{l}</option>)}<optgroup label={p.chartMode==='batting'?'Batting Chart':'Pitching Chart'}>{attrs.map(([v,l])=><option key={v} value={v as SortField}>{l}</option>)}</optgroup></select></label>
    <label><span>Order</span><select value={p.sortDirection} onChange={e=>p.onSortDirectionChange(e.target.value as SortDirection)}><option value="desc">{p.sortField==='player_name'?'Z → A':'High → Low'}</option><option value="asc">{p.sortField==='player_name'?'A → Z':'Low → High'}</option></select></label>
    <button className="universal-filter-toggle compact" onClick={()=>setOpen(true)}><span>Filters & Sort</span><span>+</span></button>
   </div>
   <div className="uf-chip-row uf-compact-chips">{active.map(chip=><span className="uf-chip" key={chip}>{chip}</span>)}{p.attributeConditions.filter(c=>c.attribute&&c.value!=='').map(c=><span className="uf-chip" key={`chip-${c.id}`}>{attrs.find(a=>a[0]===c.attribute)?.[1]||c.attribute} {operators.find(o=>o[0]===c.operator)?.[1]} {c.value}<button onClick={()=>remove(c.id)}>×</button></span>)}</div>
  </> : <>
  <button className="universal-filter-toggle" onClick={()=>setOpen(false)}><span>Filters & Sort</span><span>−</span></button>
  <div className="universal-filter-panel">
   <div className="uf-row uf-name-row"><label><span>Name</span><input value={p.searchTerm} onChange={e=>p.onSearchChange(e.target.value)} placeholder="Player name" /></label><button className="clear-filters-button" onClick={p.onClearFilters}>Clear All</button></div>
   <div className="uf-row uf-grid-4">
    <label><span>Position</span><select value={p.positionFilter} onChange={e=>p.onPositionFilterChange(e.target.value)}>{positions.map(([v,l])=><option key={v||'all'} value={v}>{l}</option>)}</select></label>
    <label><span>Year</span>{p.lockedYear ? <div className="uf-locked-value">{p.lockedYear}</div> : <select value={p.yearFilter} onChange={e=>p.onYearFilterChange(e.target.value)}><option value="">All years</option>{p.yearOptions.map(y=><option key={y}>{y}</option>)}</select>}</label>
    <label><span>Team</span><select value={p.teamFilter} onChange={e=>p.onTeamFilterChange(e.target.value)}><option value="">All teams</option>{p.teamOptions.map(t=><option key={t}>{t}</option>)}</select></label>
    <label><span>League</span><select value={p.leagueFilter} onChange={e=>p.onLeagueFilterChange(e.target.value)}><option value="">All leagues</option>{p.leagueOptions.map(l=><option key={l}>{l}</option>)}</select></label>
   </div>
   <div className="uf-row uf-grid-4">
    <label><span>Bats</span><select value={p.batsFilter} onChange={e=>p.onBatsFilterChange(e.target.value)}><option value="">All</option><option>R</option><option>L</option><option>S</option></select></label>
    <label><span>Throws</span><select value={p.throwsFilter} onChange={e=>p.onThrowsFilterChange(e.target.value)}><option value="">All</option><option>R</option><option>L</option></select></label>
    {!p.hideOwnership && <label><span>Ownership</span><select value={p.ownershipFilter} onChange={e=>p.onOwnershipFilterChange(e.target.value as OwnershipFilter)}><option value="">All Published</option><option value="owned-eligible">Owned — Season Eligible</option><option value="owned-ineligible">Owned — Not Season Eligible</option><option value="not-collected">Not Collected</option></select></label>}
    <label><span>Chart</span><select value={p.chartMode} onChange={e=>p.onChartModeChange(e.target.value as ChartMode)}><option value="batting">Batting Chart</option><option value="pitching">Pitching Chart</option></select></label>
   </div>
   <div className="uf-row uf-sort-row">
    <label><span>Sort By</span><select value={p.sortField} onChange={e=>p.onSortFieldChange(e.target.value as SortField)}>{sortGeneral.map(([v,l])=><option key={v} value={v}>{l}</option>)}<optgroup label={p.chartMode==='batting'?'Batting Chart':'Pitching Chart'}>{attrs.map(([v,l])=><option key={v} value={v as SortField}>{l}</option>)}</optgroup></select></label>
    <label><span>Order</span><select value={p.sortDirection} onChange={e=>p.onSortDirectionChange(e.target.value as SortDirection)}><option value="desc">{p.sortField==='player_name'?'Z → A':'High → Low'}</option><option value="asc">{p.sortField==='player_name'?'A → Z':'Low → High'}</option></select></label>
    <button className="add-filter-button" onClick={add}>+ Add Filter</button>
   </div>
   {(adding||p.attributeConditions.some(c=>c.attribute||c.value))&&<div className="uf-condition-list">{p.attributeConditions.map(c=><div className="uf-condition" key={c.id}>
    <select value={c.attribute} onChange={e=>update(c.id,{attribute:e.target.value as AttributeFilter})}><option value="">Attribute</option>{attrs.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
    <select value={c.operator} onChange={e=>update(c.id,{operator:e.target.value as AttributeOperator})}>{operators.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
    <input value={c.value} onChange={e=>update(c.id,{value:e.target.value})} placeholder="Value" inputMode="decimal" />
    <button onClick={()=>remove(c.id)} aria-label="Remove filter">×</button>
   </div>)}</div>}
   <div className="uf-chip-row">{active.map(chip=><span className="uf-chip" key={chip}>{chip}</span>)}{p.attributeConditions.filter(c=>c.attribute&&c.value!=='').map(c=><span className="uf-chip" key={`chip-${c.id}`}>{attrs.find(a=>a[0]===c.attribute)?.[1]||c.attribute} {operators.find(o=>o[0]===c.operator)?.[1]} {c.value}<button onClick={()=>remove(c.id)}>×</button></span>)}</div>
  </div>
  </>}
 </section>
}
