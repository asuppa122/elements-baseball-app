import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ALL_TIME_STANDINGS, CURRENT_STANDINGS, type StandingRow } from '../data/standings'

type View = 'current' | 'allTime'
type SortKey = 'rank' | 'manager' | 'wins' | 'losses' | 'games' | 'winPct' | 'rs' | 'ra' | 'rsPerGame' | 'raPerGame' | 'rd' | 'rdPct'
type SortDirection = 'asc' | 'desc'

type SortConfig = {
  key: SortKey
  direction: SortDirection
}

function pct(row: StandingRow) { return row.games ? row.wins / row.games : 0 }
function perGame(value: number, games: number) { return games ? value / games : 0 }
function runDifferential(row: StandingRow) { return row.rs - row.ra }
// Workbook RD% is the RS / RA ratio (for example Anthony S10.1: 260 / 201 = 1.29).
function rdPct(row: StandingRow) { return row.ra ? row.rs / row.ra : 0 }

const DEFAULT_SORT: SortConfig = { key: 'games', direction: 'desc' }

function sortValue(row: StandingRow, key: SortKey, sourceIndex: number) {
  switch (key) {
    case 'rank': return sourceIndex
    case 'manager': return row.manager.toLowerCase()
    case 'wins': return row.wins
    case 'losses': return row.losses
    case 'games': return row.games
    case 'winPct': return pct(row)
    case 'rs': return row.rs
    case 'ra': return row.ra
    case 'rsPerGame': return perGame(row.rs, row.games)
    case 'raPerGame': return perGame(row.ra, row.games)
    case 'rd': return runDifferential(row)
    case 'rdPct': return rdPct(row)
  }
}

export default function StandingsPage() {
  const [view,setView] = useState<View>('current')
  const [sort,setSort] = useState<SortConfig>(DEFAULT_SORT)
  const { profile } = useAuth()
  const sourceRows = view === 'current' ? CURRENT_STANDINGS : ALL_TIME_STANDINGS

  // All 11 columns are real <td> data — nothing is dropped at narrow widths.
  // The table scrolls horizontally (.standings-table-scroll already has
  // overflow:auto and the table has min-width:980px), but with no visual
  // signal that there's more to the right, mobile managers had no way to
  // discover Win%/RS/RA/RS-G/RA-G/RD/RD% existed at all. This tracks scroll
  // position so a fade + hint can show/hide instead of leaving that silent.
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false })

  function updateScrollEdges(el: HTMLDivElement | null) {
    if (!el) return
    const maxScrollLeft = el.scrollWidth - el.clientWidth
    setScrollEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft < maxScrollLeft - 4,
    })
  }

  const rows = useMemo(() => {
    return sourceRows
      .map((row, sourceIndex) => ({ row, sourceIndex }))
      .sort((a,b) => {
        const aValue = sortValue(a.row, sort.key, a.sourceIndex)
        const bValue = sortValue(b.row, sort.key, b.sourceIndex)
        let comparison = 0
        if (typeof aValue === 'string' && typeof bValue === 'string') comparison = aValue.localeCompare(bValue)
        else comparison = Number(aValue) - Number(bValue)

        if (comparison === 0 && sort.key !== 'manager') {
          comparison = a.row.manager.localeCompare(b.row.manager)
        }
        return sort.direction === 'asc' ? comparison : -comparison
      })
      .map(({row}) => row)
  }, [sourceRows, sort])

  useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    el.scrollLeft = 0
    updateScrollEdges(el)
  }, [view])

  // Re-check on resize (window resize, orientation change, sidebar toggle,
  // etc.) — without this, resizing from mobile to a width where the table
  // already fits leaves the "Scroll for..." hint stuck on from the last
  // scroll/view-change check instead of correctly disappearing.
  useEffect(() => {
    const el = tableScrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => updateScrollEdges(el))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  function toggleSort(key: SortKey) {
    setSort(current => {
      if (current.key === key) return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
      return { key, direction: key === 'manager' || key === 'rank' ? 'asc' : 'desc' }
    })
  }

  function sortIndicator(key: SortKey) {
    if (sort.key !== key) return '↕'
    return sort.direction === 'desc' ? '↓' : '↑'
  }

  function sortHeader(label: string, key: SortKey) {
    const active = sort.key === key
    return <button
      type="button"
      className={`standings-sort-button${active ? ' active' : ''}`}
      onClick={() => toggleSort(key)}
      aria-label={`Sort by ${label} ${active && sort.direction === 'desc' ? 'ascending' : 'descending'}`}
    >
      <span>{label}</span><span className="standings-sort-indicator" aria-hidden="true">{sortIndicator(key)}</span>
    </button>
  }

  return <main className="league-content-page standings-page">
    <section className="standings-hero">
      <div className="standings-title-stack">
        <h1>Elements Baseball League Standings</h1>
        <h2>{view === 'current' ? 'Current Standings' : 'All-Time Standings'}</h2>
        <span className="standings-season-identifier">{view === 'current' ? 'Season 10.1 - 1925' : 'All-Time'}</span>
      </div>
      <div className="standings-summary">
        <span><strong>{Math.round(sourceRows.reduce((n,r)=>n+r.games,0)/2)}</strong>League Games</span>
        <span><strong>{sourceRows.filter(r=>r.games>0).length}</strong>{view === 'current' ? 'Active Managers' : 'Managers with GP'}</span>
      </div>
    </section>

    <nav className="standings-tabs" aria-label="Standings views">
      <button className={view==='current'?'active':''} onClick={()=>setView('current')}><strong>Current Standings</strong></button>
      <button className={view==='allTime'?'active':''} onClick={()=>setView('allTime')}><strong>All-Time Standings</strong></button>
    </nav>

    <section
      className={`standings-table-panel${scrollEdges.left ? ' can-scroll-left' : ''}${scrollEdges.right ? ' can-scroll-right' : ''}`}
    >
      {scrollEdges.right && (
        <p className="standings-scroll-hint" aria-hidden="true">
          Scroll for Win %, RS, RA, RS/G, RA/G, RD, RD% <span>→</span>
        </p>
      )}
      <div
        className="standings-table-scroll"
        ref={tableScrollRef}
        onScroll={(event) => updateScrollEdges(event.currentTarget)}
      >
        <table className="standings-table">
          <thead><tr>
            <th>{sortHeader('Rank','rank')}</th>
            <th>{sortHeader('Manager','manager')}</th>
            <th>{sortHeader('W','wins')}</th>
            <th>{sortHeader('L','losses')}</th>
            <th>{sortHeader('GP','games')}</th>
            <th>{sortHeader('Win %','winPct')}</th>
            <th>{sortHeader('RS','rs')}</th>
            <th>{sortHeader('RA','ra')}</th>
            <th>{sortHeader('RS/G','rsPerGame')}</th>
            <th>{sortHeader('RA/G','raPerGame')}</th>
            <th>{sortHeader('RD','rd')}</th>
            <th>{sortHeader('RD%','rdPct')}</th>
          </tr></thead>
          <tbody>{rows.map((row,index)=>{
            const isMe = profile?.manager_name?.toLowerCase() === row.manager.toLowerCase()
            const rd = runDifferential(row)
            return <tr key={`${view}-${row.manager}`} className={isMe?'is-current-manager':''}>
              <td><span className="standings-rank">{index+1}</span></td>
              <td><div className="standings-manager"><strong>{row.manager}</strong>{row.sourceName && <small>Workbook: {row.sourceName}</small>}{isMe && <em>You</em>}</div></td>
              <td>{row.wins}</td><td>{row.losses}</td><td><strong>{row.games}</strong></td>
              <td>{pct(row).toFixed(3)}</td><td>{row.rs}</td><td>{row.ra}</td><td>{perGame(row.rs,row.games).toFixed(2)}</td><td>{perGame(row.ra,row.games).toFixed(2)}</td>
              <td className={rd>0?'positive-rd':rd<0?'negative-rd':''}>{rd>0?'+':''}{rd}</td>
              <td>{row.games ? rdPct(row).toFixed(2) : '—'}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </section>
  </main>
}
