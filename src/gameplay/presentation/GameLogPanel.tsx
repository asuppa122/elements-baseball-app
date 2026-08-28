import type { ScoringEventInput } from '../halfInningTransition'

/**
 * The game log.
 *
 * Deliberately still the raw event type. The events now carry enough to
 * narrate a play properly -- batter, chart result, before/after score and
 * bases -- but writing that narration is its own piece of work, and dressing
 * up `SWING_RESOLVED` as a sentence before it exists would be inventing
 * commentary the engine did not produce. The panel says so rather than
 * pretending.
 */

export type LogEvent = ScoringEventInput & { event_type: string }

function label(event: LogEvent): string {
  const p = event.payload ?? {}
  const chart = typeof p.chartResult === 'string' ? p.chartResult : null
  const batter = typeof p.batter === 'string' ? p.batter : null
  const roll = typeof p.roll === 'number' ? p.roll : null
  if (event.event_type === 'SWING_RESOLVED' && batter && chart) return `${batter} — ${chart}`
  if (event.event_type === 'PITCH_ROLLED' && roll !== null) return `Pitch ${roll}`
  return event.event_type.replaceAll('_', ' ').toLowerCase()
}

export default function GameLogPanel({ events, limit = 12 }: { events: LogEvent[]; limit?: number }) {
  const recent = [...events].slice(-limit).reverse()
  return (
    <section className="gp-log" aria-label="Game log">
      <header className="gp-log-head"><b className="s-lbl">Game Log</b><span className="s-sub s-num">{events.length}</span></header>
      {recent.length === 0
        ? <p className="gp-avail-empty">No events yet.</p>
        : (
          <ol className="gp-log-list">
            {recent.map((e) => (
              <li key={`${e.state_version}-${e.event_type}`}>
                <span className="gp-log-v s-num">{e.state_version}</span>
                <span className="gp-log-text">{label(e)}</span>
              </li>
            ))}
          </ol>
        )}
      <p className="gp-lineup-note">Play-by-play narration is not built yet.</p>
    </section>
  )
}
