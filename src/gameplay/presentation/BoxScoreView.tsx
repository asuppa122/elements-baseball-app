import { useState } from 'react'
import { buildBoxScore, type BoxScore } from '../stats/boxScore'
import { era, inningsDisplay, rate } from '../stats/gameStats'
import { describePlay } from '../stats/playDescriptions'
import { STAT_DEFS } from '../stats/statDefinitions'
import type { GameSide, GameState } from '../types'

/**
 * The persistent box score: standard view, advanced (Elements) view and the full
 * play-by-play, all derived from the game's saved play log (stats/boxScore.ts).
 * A game played before the play log existed shows only what its state reliably
 * holds and says so -- nothing is reconstructed. Exhibition games are labelled;
 * nothing here is ever presented as official season data.
 *
 * Phones: each table scrolls inside its own frame with the player column
 * pinned, the same treatment the line score already has, so the page itself
 * never scrolls sideways and nothing is shrunk past legibility.
 */

type Tab = 'traditional' | 'elements' | 'plays'

function Head({ label }: { label: string }) {
  const def = STAT_DEFS[label]
  return def ? <abbr title={`${label} — ${def}`}>{label}</abbr> : <>{label}</>
}
const SIDES: GameSide[] = ['away', 'home']

function ClassificationTag({ classification }: { classification: BoxScore['classification'] | null }) {
  if (!classification) return null
  return classification === 'official'
    ? <span className="gp-box-tag is-official">Official</span>
    : <span className="gp-box-tag" title="Played before the official launch: never counted in season statistics, standings or rest">Exhibition</span>
}

function Table({ caption, head, rows, foot }: { caption: string; head: string[]; rows: Array<Array<string | number>>; foot?: Array<string | number> }) {
  return (
    <div className="gp-box-table-wrap">
      <table className="gp-box-table">
        <caption>{caption}</caption>
        <thead><tr>{head.map((h, i) => <th scope="col" key={h + i}><Head label={h} /></th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0 ? <th scope="row" key={j}>{c}</th> : <td key={j}>{c}</td>)}</tr>)}</tbody>
        {foot && <tfoot><tr>{foot.map((c, j) => j === 0 ? <th scope="row" key={j}>{c}</th> : <td key={j}>{c}</td>)}</tr></tfoot>}
      </table>
    </div>
  )
}

export default function BoxScoreView({ state, progression, managers }: {
  state: GameState
  /** games.progression when known; omitted on the live screen, where no tag is shown. */
  progression?: string | null
  managers?: Record<GameSide, string>
}) {
  const [tab, setTab] = useState<Tab>('traditional')
  const box = buildBoxScore(state, progression)
  const teamName = (side: GameSide) => managers?.[side] ?? state.managers[side].managerName
  const name = (key: string | null) => (key ? box.names[key] ?? key : '—')
  const classification = progression === undefined ? null : box.classification

  if (box.kind === 'legacy') {
    return (
      <section className="gp-box" aria-label="Box score">
        <header className="gp-box-head"><h3>Box score</h3><ClassificationTag classification={classification} /></header>
        <p className="gp-postgame-note">
          This game was played before plays were recorded, so it has no batting lines, pitching lines or play-by-play.
          Only what the saved game holds is shown: the final score{box.runsByInning ? ', the line score' : ''} and the pitchers used.
        </p>
        <div className="gp-box-legacy">
          {SIDES.map((side) => (
            <div key={side}><strong>{teamName(side)} {box.final[side]}</strong><span>Pitchers: {box.pitchersUsed[side].map((k) => name(k)).join(', ') || '—'}</span></div>
          ))}
        </div>
      </section>
    )
  }

  const { stats, decisions } = box
  const decisionOf = (side: GameSide, key: string) => {
    const tags: string[] = []
    if (decisions.winner === side && decisions.W === key) tags.push('W')
    if (decisions.winner && decisions.winner !== side && decisions.L === key) tags.push('L')
    if (decisions.winner === side && decisions.SV === key) tags.push('SV')
    if (decisions.HLD.some((h) => h.side === side && h.cardKey === key)) tags.push('HLD')
    if (decisions.BSV.some((b) => b.side === side && b.cardKey === key)) tags.push('BS')
    return tags.length ? ` (${tags.join(', ')})` : ''
  }
  const notes = (side: GameSide) => {
    const lines = stats.batting[side]
    const list = (label: string, pick: (l: (typeof lines)[number]) => number) => {
      const who = lines.filter((l) => pick(l) > 0).map((l) => `${name(l.cardKey)}${pick(l) > 1 ? ` ${pick(l)}` : ''}`)
      return who.length ? `${label}: ${who.join(', ')}` : null
    }
    const team = stats.team[side]
    return [
      list('2B', (l) => l['2B']), list('3B', (l) => l['3B']), list('HR', (l) => l.HR), list('SB', (l) => l.SB), list('CS', (l) => l.CS),
      list('SAC', (l) => l.SAC), list('SF', (l) => l.SF), list('GIDP', (l) => l.GIDP),
      team.DP ? `DP: ${team.DP}` : null, team.TP ? `TP: ${team.TP}` : null, `LOB: ${team.LOB}`,
    ].filter(Boolean) as string[]
  }

  const halves: Array<{ key: string; label: string; plays: typeof stats.plays }> = []
  for (const play of stats.plays) {
    const key = `${play.inning}-${play.half}`
    let group = halves.at(-1)
    if (!group || group.key !== key) { group = { key, label: `${play.half === 'top' ? 'Top' : 'Bottom'} ${play.inning}`, plays: [] }; halves.push(group) }
    group.plays.push(play)
  }

  return (
    <section className="gp-box" aria-label="Box score">
      <header className="gp-box-head">
        <h3>Box score</h3>
        <ClassificationTag classification={classification} />
        {!box.complete && <span className="gp-box-tag is-live">In progress</span>}
      </header>

      <div className="gp-box-tabs" role="tablist" aria-label="Box score views">
        {(['traditional', 'elements', 'plays'] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'is-active' : undefined} onClick={() => setTab(t)}>
            {t === 'traditional' ? 'Standard' : t === 'elements' ? 'Advanced' : 'Play-by-play'}
          </button>
        ))}
      </div>

      {tab === 'traditional' && SIDES.map((side) => {
        const b = stats.batting[side]
        const sum = (pick: (l: (typeof b)[number]) => number) => b.reduce((n, l) => n + pick(l), 0)
        return (
          <div className="gp-box-side" key={side}>
            <Table caption={`${teamName(side)} — batting`} head={['', 'AB', 'R', 'H', 'RBI', 'BB', 'SO']}
              rows={b.map((l) => [name(l.cardKey), l.AB, l.R, l.H, l.RBI, l.BB, l.SO])}
              foot={['Totals', sum((l) => l.AB), sum((l) => l.R), sum((l) => l.H), sum((l) => l.RBI), sum((l) => l.BB), sum((l) => l.SO)]} />
            <p className="gp-box-notes">{notes(side).join(' · ')}</p>
            <Table caption={`${teamName(side)} — pitching`} head={['', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'ERA']}
              rows={stats.pitching[side].map((l) => [`${name(l.cardKey)}${decisionOf(side, l.cardKey)}`, inningsDisplay(l.outs), l.H, l.R, l.ER, l.BB, l.SO, era(l.ER, l.outs)])} />
          </div>
        )
      })}

      {tab === 'elements' && (
        <details className="gp-box-key">
          <summary>Key</summary>
          <dl>
            {['PA', 'OBA', 'OCHO', 'PCHW', 'OBP', 'DEF', 'BF', 'ADV', 'OCHW', 'HCHO', 'R while pitching', 'DBP/DBPa', 'TBP/TBPa', 'CS/SBa', 'OFA'].map((k) => (
              <div key={k}><dt>{k}</dt><dd>{STAT_DEFS[k]}</dd></div>
            ))}
          </dl>
        </details>
      )}

      {tab === 'elements' && SIDES.map((side) => (
        <div className="gp-box-side" key={side}>
          <Table caption={`${teamName(side)} — advanced batting`} head={['', 'PA', 'OBA', 'OCHO', 'PCHW', 'OBP', 'DEF']}
            rows={stats.batting[side].map((l) => [name(l.cardKey), l.PA, l.OBA, l.OCHO, l.PCHW, rate(l.H + l.BB, l.PA), (stats.fielding[side].find((f) => f.cardKey === l.cardKey)?.positions ?? []).join(' · ') || '—'])} />
          <Table caption={`${teamName(side)} — advanced pitching`} head={['', 'BF', 'ADV', 'OCHW', 'HCHO', 'R while pitching']}
            rows={stats.pitching[side].map((l) => [name(l.cardKey), l.BF, l.ADV, l.OCHW, l.HCHO, l.runsWhilePitching])} />
          <Table caption={`${teamName(side)} — defence`} head={['', 'DBP/DBPa', 'TBP/TBPa', 'CS/SBa', 'OFA']}
            rows={stats.fielding[side].filter((f) => f.DBPa || f.TBPa || f.CS || f.SBa || f.OFA).map((f) => [name(f.cardKey), `${f.DBP}/${f.DBPa}`, `${f.TBP}/${f.TBPa}`, `${f.CS}/${f.SBa}`, f.OFA])} />
        </div>
      ))}

      {tab === 'plays' && (
        <ol className="gp-box-plays">
          {halves.map((h) => (
            <li key={h.key}>
              <h4>{h.label}</h4>
              <ol>{h.plays.map((p) => <li key={p.seq}><span className="gp-box-play-score">{p.scoreAfter.away}–{p.scoreAfter.home}</span>{describePlay(p, name)}</li>)}</ol>
            </li>
          ))}
          {!halves.length && <li className="gp-postgame-note">No plays yet.</li>}
        </ol>
      )}
    </section>
  )
}
