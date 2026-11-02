import type { ScoringEventInput } from '../halfInningTransition'
import { narrate } from './playNarration'
import { playOf, type RollView } from './playRecord'

/**
 * The game log, kept the way a scorer at the table would: one plain line per
 * roll -- who rolled, what came up, what it did -- under half-inning headings,
 * the current half-inning on top (Anthony, 2026-11-01, after ERA's log):
 *
 *   Roll: (10) +5, Advantage: Chuck Smith
 *   Roll: (20) Rodney Scott: Double [Smith]
 *   Rodney Scott: Scored
 *   Score: Will 1 – 0 Anthony
 *
 * Every line is read from what the saved event recorded -- the batter, the
 * pitcher, the roll, the score and the bases before and after -- so both
 * managers read the same log and an older game reads the same way. The score
 * follows each run as it scores rather than waiting for the inning to end.
 * Readying up, starting or cancelling a call and picking an option are how a
 * play was reached, not plays, and are left out. An event too old to carry a
 * roll falls back to its sentence, and is otherwise skipped.
 */

export type LogEvent = ScoringEventInput & { event_type: string }

type Line = { key: string; text: string; kind: 'roll' | 'scored' | 'score' | 'play' }
type Score = { away: number; home: number }
type Runner = { cardKey: string; playerName: string }
type Bases = Partial<Record<'first' | 'second' | 'third', Runner | null>>

const NOUN: Record<string, string> = {
  PU: 'Pop up', K: 'Strikeout', FB: 'Fly ball', GB: 'Ground ball', BB: 'Walk',
  '1B': 'Single', '1B+': 'Single+', '2B': 'Double', '3B': 'Triple', HR: 'Home run',
}
const ORDINAL = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
const lastName = (name: string) => name.split(' ').slice(-1)[0] || name
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

function asScore(v: unknown): Score | null {
  const s = v as Score | null
  return s && typeof s.away === 'number' && typeof s.home === 'number' ? s : null
}
function asRollView(v: unknown): RollView | null {
  const r = v as RollView | null
  return r && typeof r.roll === 'number' && typeof r.result === 'string' ? r : null
}

/** Who crossed the plate on this step: lead runner first, then the batter -- the only order the bases allow. */
function scorers(p: Record<string, unknown>, runs: number): string[] {
  if (runs <= 0) return []
  const before = (p.bases ?? {}) as Bases
  const after = (p.resultingBases ?? {}) as Bases
  const stillOn = new Set(Object.values(after).filter(Boolean).map((r) => r!.cardKey))
  const gone = (['third', 'second', 'first'] as const).map((b) => before[b]).filter((r): r is Runner => Boolean(r) && !stillOn.has(r!.cardKey)).map((r) => r.playerName)
  const batter = str(p.batter)
  const batterOn = Object.values(after).some((r) => r && r.playerName === batter)
  const candidates = batter && !batterOn && !gone.includes(batter) ? [...gone, batter] : gone
  return candidates.slice(0, runs)
}

function linesFor(event: LogEvent, managers?: { away: string; home: string }): Line[] {
  const p = event.payload ?? {}
  const key = `${event.state_version}-${event.event_type}`
  const view = asRollView(p.rollView)
  const play = playOf(event)
  const batter = str(p.batter) ?? 'Batter'
  const pitcher = str(p.pitcher) ?? 'Pitcher'
  const out: Line[] = []

  if (event.event_type === 'PITCH_ROLLED' && view) {
    const control = view.modifiers[0]?.value
    const winner = view.tone === 'defense' ? pitcher : view.tone === 'offense' ? batter : null
    out.push({ key, kind: 'roll', text: `Roll: (${view.roll})${control !== undefined ? ` ${signed(control)}` : ''}, ${winner ? `Advantage: ${winner}` : 'No advantage'}` })
  } else if (p.resolutionKind === 'AUTOMATIC_PITCHER_ADVANTAGE') {
    out.push({ key, kind: 'roll', text: `No pitch, Advantage: ${pitcher}` })
  } else if (event.event_type === 'SWING_RESOLVED' && view) {
    const chart = str(p.chartResult)
    out.push({ key, kind: 'roll', text: `Roll: (${view.roll}) ${batter}: ${chart ? NOUN[chart] ?? chart : view.result} [${lastName(pitcher)}]` })
  } else if (view) {
    // A decision roll -- a steal, a throw, a ground ball's out, an extra base.
    const mods = view.modifiers.map((m) => `${m.label} ${signed(m.value)}`).join(', ')
    const what = play?.summary ?? view.result
    out.push({ key, kind: 'roll', text: `Roll: (${view.roll})${mods ? ` ${mods}` : ''}, ${what}${view.total !== undefined ? ` (${view.total})` : ''}${view.natural ? ` — ${view.natural}` : ''}` })
  } else if (play) {
    out.push({ key, kind: 'play', text: play.summary ?? play.lines.join(' ') })
  } else {
    const n = narrate(event)
    if (n) out.push({ key, kind: 'play', text: n.text })
  }

  // The runs, as they score, and the score after them.
  const before = asScore(p.score)
  const after = asScore(p.resultingScore)
  if (out.length && before && after) {
    const side = p.half === 'bottom' ? 'home' : 'away'
    const runs = after[side] - before[side]
    if (runs > 0) {
      const names = scorers(p, runs)
      names.forEach((name, i) => out.push({ key: `${key}-r${i}`, kind: 'scored', text: `${name}: Scored` }))
      for (let i = names.length; i < runs; i += 1) out.push({ key: `${key}-r${i}`, kind: 'scored', text: 'Run scored' })
      out.push({ key: `${key}-s`, kind: 'score', text: `Score: ${managers?.away ?? 'Away'} ${after.away} – ${after.home} ${managers?.home ?? 'Home'}` })
    }
  }
  return out
}

export default function GameLogPanel({ events, managers }: { events: LogEvent[]; managers?: { away: string; home: string } }) {
  // One heading per half-inning, in order of play; the half-innings are then
  // listed latest first so the current one is on top, read top to bottom.
  const groups: Array<{ label: string; lines: Line[] }> = []
  let count = 0
  for (const event of events) {
    const lines = linesFor(event, managers)
    if (!lines.length) continue
    count += lines.filter((l) => l.kind !== 'scored' && l.kind !== 'score').length
    const p = event.payload ?? {}
    const label = typeof p.inning === 'number' && typeof p.half === 'string'
      ? `${p.half === 'top' ? 'Top' : 'Bottom'} ${ORDINAL(p.inning)}${managers ? ` · ${p.half === 'top' ? managers.away : managers.home} batting` : ''}`
      : ''
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.lines.push(...lines)
    else groups.push({ label, lines: [...lines] })
  }
  groups.reverse()

  return (
    <section className="gp-log" aria-label="Game log">
      <header className="gp-log-head"><b className="s-lbl">Game Log</b><span className="s-sub s-num">{count}</span></header>
      {count === 0
        ? <p className="gp-avail-empty">No plays yet.</p>
        : groups.map((g, i) => (
          <div className="gp-log-half" key={`${g.label}-${i}`}>
            {g.label && <h3 className="gp-log-inning">{g.label}{i === 0 ? ' (Current)' : ''}</h3>}
            <ol className="gp-log-list">
              {g.lines.map((l) => (
                <li key={l.key} className={`gp-log-line is-${l.kind}`}>{l.text}</li>
              ))}
            </ol>
          </div>
        ))}
    </section>
  )
}
