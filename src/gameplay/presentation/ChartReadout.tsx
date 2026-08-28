import type { GameCardSnapshot, GameSide, GameState } from '../types'

/**
 * The current matchup's charts, as the physical cards show them.
 *
 * Straight off the frozen card snapshots -- these are printed ranges, so they
 * do not change with fatigue and there is nothing to derive. Which chart is
 * actually consulted depends on the advantage, so the one in play is marked.
 */

const ROWS: Array<[string, keyof GameCardSnapshot['hitter']['chart']]> = [
  ['PU', 'PU'], ['K', 'K'], ['GB', 'GB'], ['FB', 'FB'], ['BB', 'BB'],
  ['1B', '1B'], ['1B+', '1B+'], ['2B', '2B'], ['3B', '3B'], ['HR', 'HR'],
]

export default function ChartReadout({ state }: { state: GameState }) {
  const offense: GameSide = state.half === 'top' ? 'away' : 'home'
  const defense: GameSide = offense === 'home' ? 'away' : 'home'
  const pa = state.plateAppearance
  const batter = pa.batterCardKey ? state.pregame[offense].roster?.cards[pa.batterCardKey] ?? null : null
  const pitcher = pa.pitcherCardKey ? state.pregame[defense].roster?.cards[pa.pitcherCardKey] ?? null : null
  const advantage = pa.advantage

  return (
    <section className="gp-chart" aria-label="Charts">
      <header className="gp-avail-head">
        <b className="s-lbl">Chart</b>
        <span className="s-sub">{advantage ? `${advantage} advantage` : 'no advantage yet'}</span>
      </header>
      <table className="gp-chart-table">
        <thead>
          <tr>
            <th></th>
            <th className={advantage === 'hitter' ? 'is-live' : undefined}>Hitter</th>
            <th className={advantage === 'pitcher' ? 'is-live' : undefined}>Pitcher</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, key]) => {
            const h = batter?.hitter.chart[key] ?? null
            // Pitcher charts have no 1B+ row on the physical card.
            const p = key === '1B+' ? null : pitcher?.pitcher.chart[key as keyof GameCardSnapshot['pitcher']['chart']] ?? null
            if (!h && !p) return null
            return (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className={`s-num${advantage === 'hitter' ? ' is-live' : ''}`}>{h ?? '—'}</td>
                <td className={`s-num${advantage === 'pitcher' ? ' is-live' : ''}`}>{p ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
