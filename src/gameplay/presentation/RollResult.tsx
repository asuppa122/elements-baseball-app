import type { LogEvent } from './GameLogPanel'
import type { RollView } from './playRecord'

/**
 * The last roll, under the roll button -- where both managers are already
 * looking. It is read from the saved event, not the roller's own screen, so
 * the manager who did not roll sees the same number, the same modifiers and
 * the same result. The die and the result are set apart on purpose: the
 * number is not the outcome, the sum against the rating is.
 *
 * Stays until the next roll replaces it; it sits in the flow below the
 * buttons, so it never covers one. The full play-by-play is the recap's job;
 * this is the die, the arithmetic and the result.
 */

function asRollView(value: unknown): RollView | null {
  if (!value || typeof value !== 'object') return null
  const v = value as RollView
  return typeof v.roll === 'number' && typeof v.result === 'string' ? v : null
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

export default function RollResult({ events }: { events: LogEvent[] }) {
  let latest: { view: RollView; version: number } | null = null
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const view = asRollView(events[i].payload?.rollView)
    if (view) { latest = { view, version: events[i].state_version }; break }
  }
  if (!latest) return null
  const { view } = latest
  const decisive = new Set(view.decisive ?? [])

  return (
    <section className={`gp-rollresult is-${view.tone}`} aria-label="Last roll" aria-live="polite" key={latest.version}>
      <div className="gp-rollresult-die" aria-label={`Rolled ${view.roll}`}>
        <small>d20</small>
        <strong className="s-num">{view.roll}</strong>
      </div>
      <div className="gp-rollresult-main">
        <span className="gp-rollresult-title"><b className="s-lbl">Last roll</b> {view.title}</span>
        <p className="gp-rollresult-outcome">{view.result}</p>
        {(view.modifiers.length > 0 || view.versus) && (
          <ul className="gp-rollresult-math s-num" aria-label="Roll breakdown">
            <li>d20 {view.roll}</li>
            {view.modifiers.map((m) => (
              <li key={m.label} className={decisive.has(m.label) ? 'is-decisive' : undefined}>
                {m.label} {signed(m.value)}{decisive.has(m.label) && <em> decided it</em>}
              </li>
            ))}
            {view.total !== undefined && <li className="is-total">= {view.total}</li>}
            {view.versus && <li className="is-versus">vs {view.versus.label} {view.versus.value}</li>}
          </ul>
        )}
        {view.natural && <p className="gp-rollresult-natural">{view.natural}</p>}
      </div>
    </section>
  )
}
