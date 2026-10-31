import type { LogEvent } from './GameLogPanel'
import { playOf, type RollView } from './playRecord'

/**
 * The last roll, under the roll button -- where both managers are already
 * looking. It is read from the saved event, not the roller's own screen, so
 * the manager who did not roll sees the same number, the same modifiers and
 * the same result. The die and the result are set apart on purpose: the
 * number is not the outcome, the sum against the rating is.
 *
 * Stays until the next roll replaces it; it sits in the flow below the
 * buttons, so it never covers one. The full play-by-play is the recap's job;
 * this is the die, the arithmetic and the one-line outcome.
 */

function asRollView(value: unknown): RollView | null {
  if (!value || typeof value !== 'object') return null
  const v = value as RollView
  return typeof v.roll === 'number' && typeof v.result === 'string' ? v : null
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

export default function RollResult({ events }: { events: LogEvent[] }) {
  let latest: { view: RollView; version: number; summary?: string } | null = null
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const view = asRollView(events[i].payload?.rollView)
    if (view) { latest = { view, version: events[i].state_version, summary: playOf(events[i])?.summary }; break }
  }
  // Before the first roll the slot is still drawn, so the cards above it are
  // the same size on the first pitch as on the hundredth.
  if (!latest) {
    return (
      <section className="gp-rollresult is-empty" aria-label="Last roll">
        <div className="gp-rollresult-main">
          <span className="gp-rollresult-title"><b className="s-lbl">Last roll</b></span>
          <p className="gp-rollresult-outcome is-empty">No rolls yet this game.</p>
        </div>
      </section>
    )
  }
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
        {/* What the roll did on the field -- who scored, who moved, the outs --
            from the saved play. Older events without one keep the chart result. */}
        <p className="gp-rollresult-outcome" title={latest.summary ?? view.result}>{latest.summary ?? view.result}</p>
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
            {/* In the same line as the math, so a natural never adds a row
                and resizes the cards above. */}
            {view.natural && <li className="gp-rollresult-natural">{view.natural}</li>}
          </ul>
        )}
        {view.natural && view.modifiers.length === 0 && !view.versus && <p className="gp-rollresult-natural">{view.natural}</p>}
      </div>
    </section>
  )
}
