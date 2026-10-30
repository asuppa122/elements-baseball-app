import type { ScoringEventInput } from '../halfInningTransition'
import { narrate } from './playNarration'
import { playOf } from './playRecord'

/**
 * The game log, written like a published box-score play-by-play: plays only,
 * in order under half-inning headings, with the current half-inning on top.
 *
 * A play is a saved step that changed the game -- a batted ball, a walk, a
 * steal, a throw, a substitution -- and carries its own sentences
 * (playRecord.ts). Pitch rolls, readying up, starting or cancelling a call
 * and picking an option on the board are how a play was reached, not plays,
 * and are left out; the roll itself is shown under the Roll button. Events
 * saved before the play text existed fall back to playNarration's sentence
 * where it can make one, and are otherwise skipped rather than shown raw.
 */

export type LogEvent = ScoringEventInput & { event_type: string }

type Play = { key: string; text: string; kind: string; inning: number | null; half: string | null }

function playFrom(event: LogEvent): Play | null {
  const p = event.payload ?? {}
  const inning = typeof p.inning === 'number' ? p.inning : null
  const half = typeof p.half === 'string' ? p.half : null
  const key = `${event.state_version}-${event.event_type}`
  const play = playOf(event)
  if (play) return { key, text: play.lines.join(' '), kind: play.kind, inning, half }
  const n = narrate(event)
  return n ? { key, text: n.text, kind: n.kind, inning, half } : null
}

const ORDINAL = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

export default function GameLogPanel({ events, managers }: { events: LogEvent[]; managers?: { away: string; home: string } }) {
  const plays = events.map(playFrom).filter((p): p is Play => p !== null)

  // One heading per half-inning, in order of play; the half-innings are then
  // listed latest first so the current one is on top, read top to bottom.
  const groups: Array<{ label: string; plays: Play[] }> = []
  for (const play of plays) {
    const label = play.inning !== null && play.half
      ? `${play.half === 'top' ? 'Top' : 'Bottom'} ${ORDINAL(play.inning)}${managers ? ` · ${play.half === 'top' ? managers.away : managers.home} batting` : ''}`
      : ''
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.plays.push(play)
    else groups.push({ label, plays: [play] })
  }
  groups.reverse()

  return (
    <section className="gp-log" aria-label="Game log">
      <header className="gp-log-head"><b className="s-lbl">Game Log</b><span className="s-sub s-num">{plays.length}</span></header>
      {plays.length === 0
        ? <p className="gp-avail-empty">No plays yet.</p>
        : groups.map((g, i) => (
          <div className="gp-log-half" key={`${g.label}-${i}`}>
            {g.label && <h3 className="gp-log-inning">{g.label}</h3>}
            <ol className="gp-log-list">
              {g.plays.map((p) => (
                <li key={p.key} className="is-narrated">
                  <span className={`gp-log-text is-${p.kind}`}>{p.text}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
    </section>
  )
}
