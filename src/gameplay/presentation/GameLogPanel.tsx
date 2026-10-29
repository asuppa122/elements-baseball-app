import type { ScoringEventInput } from '../halfInningTransition'
import { narrate } from './playNarration'

/**
 * The game log, narrated where the events support it.
 *
 * `narrate` builds a sentence only from what the engine actually recorded and
 * returns null otherwise -- so events written before the payloads were widened
 * fall back to the raw type rather than being dressed up as commentary that was
 * never produced. Both kinds appear here, and they look different on purpose.
 */

export type LogEvent = ScoringEventInput & { event_type: string }

type Line = { text: string; narrated: boolean; kind: string }

function line(event: LogEvent): Line {
  const n = narrate(event)
  if (n) return { text: n.text, narrated: true, kind: n.kind }
  const p = event.payload ?? {}
  const roll = typeof p.roll === 'number' ? p.roll : null
  if (event.event_type === 'PITCH_ROLLED' && roll !== null) {
    return { text: `Pitch ${roll}`, narrated: false, kind: 'neutral' }
  }
  return { text: event.event_type.replaceAll('_', ' ').toLowerCase(), narrated: false, kind: 'neutral' }
}

// Turn hand-offs, not plays: a two-player game writes one before every pitch.
const NOT_PLAYS = new Set(['OFFENSE_READY'])

export default function GameLogPanel({ events, limit = 12 }: { events: LogEvent[]; limit?: number }) {
  const recent = events.filter((e) => !NOT_PLAYS.has(e.event_type)).slice(-limit).reverse()
  return (
    <section className="gp-log" aria-label="Game log">
      <header className="gp-log-head"><b className="s-lbl">Game Log</b><span className="s-sub s-num">{events.length}</span></header>
      {recent.length === 0
        ? <p className="gp-avail-empty">No events yet.</p>
        : (
          <ol className="gp-log-list">
            {recent.map((e) => {
              const l = line(e)
              return (
                <li key={`${e.state_version}-${e.event_type}`} className={l.narrated ? 'is-narrated' : undefined}>
                  <span className="gp-log-v s-num">{e.state_version}</span>
                  <span className={`gp-log-text is-${l.kind}`}>{l.text}</span>
                </li>
              )
            })}
          </ol>
        )}
      <p className="gp-lineup-note">
        Plays before 28 August have no narration — their events recorded the dice, not the play.
      </p>
    </section>
  )
}
