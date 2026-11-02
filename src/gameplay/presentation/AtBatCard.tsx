import type { ReactNode } from 'react'
import type { GameState } from '../types'
import type { LogEvent } from './GameLogPanel'
import { playOf, type RollView } from './playRecord'

/**
 * The plate appearance in one card, where both managers are already looking:
 * - the last roll -- the die, what it did and the arithmetic -- read from the
 *   saved event, so the manager who did not roll sees the same number, the
 *   same modifiers and the same result;
 * - the at-bat so far as four steps (Pitch, Advantage, Swing, Result), lit as
 *   they happen, so the earlier numbers are still there once the next roll
 *   replaces the last one;
 * - what can be done now: the calls before the pitch and the roll button, or
 *   who is being waited on.
 *
 * It replaces a separate roll row, last-roll box and decisions box that said
 * the same numbers two and three times.
 */

function asRollView(value: unknown): RollView | null {
  if (!value || typeof value !== 'object') return null
  const v = value as RollView
  return typeof v.roll === 'number' && typeof v.result === 'string' ? v : null
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

function LastRoll({ events }: { events: LogEvent[] }) {
  let latest: { view: RollView; version: number; summary?: string } | null = null
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const view = asRollView(events[i].payload?.rollView)
    if (view) { latest = { view, version: events[i].state_version, summary: playOf(events[i])?.summary }; break }
  }
  if (!latest) {
    return (
      <>
        <div className="gp-atbat-die is-empty" aria-hidden="true"><small>d20</small><strong className="s-num">–</strong></div>
        <div className="gp-atbat-body">
          <span className="gp-atbat-title"><b className="s-lbl">Last roll</b></span>
          <p className="gp-atbat-outcome is-empty">No rolls yet this game.</p>
        </div>
      </>
    )
  }
  const { view } = latest
  const outcome = latest.summary ?? view.result
  const cut = outcome.indexOf(' — ')
  const head = cut < 0 ? outcome : outcome.slice(0, cut)
  const facts = cut < 0 ? '' : outcome.slice(cut + 3)
  const decisive = new Set(view.decisive ?? [])

  return (
    <>
      <div className="gp-atbat-die" aria-label={`Rolled ${view.roll}`} key={`die-${latest.version}`}>
        <small>d20</small>
        <strong className="s-num">{view.roll}</strong>
      </div>
      <div className="gp-atbat-body" aria-live="polite" key={`body-${latest.version}`}>
        <span className="gp-atbat-title"><b className="s-lbl">Last roll</b> {view.title}</span>
        {/* What the roll did on the field -- who scored, who moved, the outs --
            from the saved play. Older events without one keep the chart result. */}
        <p className="gp-atbat-outcome" title={outcome}>
          <span className="gp-atbat-head">{head}</span>
          {facts && <><span className="gp-atbat-sep"> — </span><span className="gp-atbat-facts">{facts}</span></>}
        </p>
        {(view.modifiers.length > 0 || view.versus) && (
          <ul className="gp-atbat-math s-num" aria-label="Roll breakdown">
            <li>d20 {view.roll}</li>
            {view.modifiers.map((m) => (
              <li key={m.label} className={decisive.has(m.label) ? 'is-decisive' : undefined}>
                {m.label} {signed(m.value)}{decisive.has(m.label) && <em> decided it</em>}
              </li>
            ))}
            {view.total !== undefined && <li className="is-total">= {view.total}</li>}
            {view.versus && <li className="is-versus">vs {view.versus.label} {view.versus.value}</li>}
            {view.natural && <li className="gp-atbat-natural">{view.natural}</li>}
          </ul>
        )}
        {view.natural && view.modifiers.length === 0 && !view.versus && <p className="gp-atbat-natural">{view.natural}</p>}
      </div>
    </>
  )
}

function Steps({ state }: { state: GameState }) {
  const pa = state.plateAppearance
  const advantage = pa.advantage
  const steps: Array<{ label: string; value: string | null; tone?: string }> = [
    // An automatic pitcher advantage skips the pitch roll altogether.
    { label: 'Pitch', value: pa.pitchRoll !== null ? String(pa.pitchRoll) : advantage ? 'Auto' : null },
    { label: 'Adv', value: advantage ? advantage.toUpperCase() : null, tone: advantage === 'hitter' ? 'is-hitter' : advantage === 'pitcher' ? 'is-pitcher' : undefined },
    { label: 'Swing', value: pa.swingRoll !== null ? String(pa.swingRoll) : null },
    { label: 'Result', value: pa.chartResult ?? null },
  ]
  const current = steps.findIndex((s) => s.value === null)
  return (
    <ol className="gp-atbat-steps" aria-label="This at-bat">
      {steps.map((s, i) => (
        <li key={s.label} className={s.value !== null ? 'is-done' : i === current ? 'is-current' : undefined}>
          <b className="s-lbl">{s.label}</b>
          <strong className={`s-num${s.tone ? ` ${s.tone}` : ''}`}>{s.value ?? '—'}</strong>
        </li>
      ))}
    </ol>
  )
}

export default function AtBatCard({ state, events, calls, controls }: {
  state: GameState
  events: LogEvent[]
  /** The calls legal before this pitch, already filtered to this manager. */
  calls: ReactNode[]
  /** The roll button, or the waiting / game-over line (RollControls). */
  controls: ReactNode
}) {
  let tone = 'is-empty'
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const view = asRollView(events[i].payload?.rollView)
    if (view) { tone = `is-${view.tone}`; break }
  }
  return (
    <section className={`gp-atbat ${tone}`} aria-label="At bat">
      <div className="gp-atbat-grid">
        <LastRoll events={events} />
        <Steps state={state} />
        <div className="gp-atbat-actions">
          {calls.length > 0 && (
            <div className="gp-atbat-calls" aria-label="Before the pitch">
              <b className="s-lbl">Before the pitch</b>
              <div className="gp-atbat-calls-list">{calls}</div>
            </div>
          )}
          {controls}
        </div>
      </div>
    </section>
  )
}
