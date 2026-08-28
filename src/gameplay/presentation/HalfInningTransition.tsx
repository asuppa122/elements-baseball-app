import { useState } from 'react'
import type { HalfInningTransition as Transition, ScoringPlay } from '../halfInningTransition'
import type { GameSide } from '../types'

/**
 * The beat between one half ending and the next starting.
 *
 * The scoreboard owns the line score; this shows it at the moment a column is
 * freshly filled, with that column marked. Scale follows the half: a scoreless
 * half is the announcement and the column, a scoring half also gets the plays
 * that produced it, with the rest of the game's scoring behind an expand.
 */

function halfLabel(t: Transition): string {
  return `${t.half === 'top' ? 'Top' : 'Bottom'} ${t.inning}`
}

function PlayLine({ play, managers }: { play: ScoringPlay; managers: Record<GameSide, string> }) {
  return (
    <li>
      <span className="gp-transition-play-runs">{play.runs === 1 ? '1 run' : `${play.runs} runs`}</span>
      <span className="gp-transition-play-detail">
        {play.batter ?? 'Batter'}
        {play.chartResult ? <em> {play.chartResult}</em> : null}
        {play.pitcher ? <span className="gp-transition-muted"> off {play.pitcher}</span> : null}
      </span>
      <span className="gp-transition-muted">
        {play.half === 'top' ? 'T' : 'B'}{play.inning} · {managers[play.side]}
        {play.outsBefore !== null ? ` · ${play.outsBefore} out` : ''}
      </span>
    </li>
  )
}

export default function HalfInningTransition({
  transition,
  managers,
  onDismiss,
}: {
  transition: Transition
  managers: Record<GameSide, string>
  onDismiss?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const t = transition
  const { away, home, innings, recorded } = t.lineScore
  const cell = (runs: number) => (recorded ? runs : '–')

  const headline = t.gameComplete
    ? 'That ends it'
    : t.tier === 'SCORELESS'
      // "1-2-3" is not knowable from what is recorded -- a scoreless half can
      // still have had baserunners -- so the headline claims only scoreless.
      ? `${managers[t.side]} held scoreless`
      : t.tier === 'SCORING'
        ? `${t.runs === 1 ? 'A run' : `${t.runs} runs`} for ${managers[t.side]}`
        : `${halfLabel(t)} is over`

  return (
    <section className="gp-transition" aria-label={`End of ${halfLabel(t)}`}>
      <header className="gp-transition-head">
        <span className="gp-transition-half">END {t.half === 'top' ? 'TOP' : 'BOT'} {t.inning}</span>
        <strong className="gp-transition-headline">{headline}</strong>
        {onDismiss && (
          <button type="button" className="gp-transition-dismiss" onClick={onDismiss}>
            Continue
          </button>
        )}
      </header>

      <div className="gp-transition-linescore-wrap">
        <table className="gp-transition-linescore">
          <thead>
            <tr>
              <th scope="col" className="gp-transition-team"></th>
              {Array.from({ length: innings }, (_, i) => (
                <th scope="col" key={i} className={i === t.filledColumn ? 'is-filled' : undefined}>{i + 1}</th>
              ))}
              <th scope="col" className="gp-transition-total">R</th>
            </tr>
          </thead>
          <tbody>
            {(['away', 'home'] as GameSide[]).map((side) => (
              <tr key={side} className={side === t.side ? 'is-batting' : undefined}>
                <th scope="row" className="gp-transition-team">{managers[side]}</th>
                {(side === 'away' ? away : home).map((runs, i) => (
                  <td
                    key={i}
                    className={i === t.filledColumn && side === t.side ? 'is-filled' : undefined}
                  >{cell(runs)}</td>
                ))}
                <td className="gp-transition-total">{t.score[side]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!recorded && (
        <p className="gp-transition-note">
          This game predates per-inning run tracking, so only the running total is known.
        </p>
      )}

      {/* A scoreless half stops here: the announcement and the column are the
          whole story. A half with no per-inning record still shows any play the
          log can prove -- withholding a real walk-off because the game predates
          runsByInning would hide something true. */}
      {(t.tier === 'SCORING' || (t.tier === 'UNKNOWN' && t.scoringPlays.plays.length > 0)) && (
        <div className="gp-transition-plays">
          {!t.scoringPlays.available ? (
            <p className="gp-transition-note">
              This game's log records the dice, not the score, so the plays behind these runs cannot
              be listed.
            </p>
          ) : (
            <>
              {t.scoringPlays.plays.length > 0 && <h4>How they scored</h4>}
              {t.scoringPlays.plays.length > 0 && (
                <ul className="gp-transition-play-list">
                  {t.scoringPlays.plays.map((play) => (
                    <PlayLine key={play.stateVersion} play={play} managers={managers} />
                  ))}
                </ul>
              )}
              {!t.scoringPlays.complete && (
                <p className="gp-transition-note">
                  {t.tier === 'UNKNOWN'
                    ? 'Shown from the event log. Without a per-inning record this cannot be confirmed as every run of the half.'
                    : t.scoringPlays.plays.length === 0
                      ? 'None of this half’s runs came from a play the log records a score for.'
                      : 'Partial — the log accounts for some of this half’s runs. Runs scored on a manager decision are not recorded with a score.'}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {t.earlierScoringPlays.length > 0 && (
        <div className="gp-transition-earlier">
          <button type="button" className="gp-transition-expand" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            {expanded ? 'Hide' : 'Show'} scoring so far ({t.earlierScoringPlays.length})
          </button>
          {expanded && (
            <ul className="gp-transition-play-list">
              {t.earlierScoringPlays.map((play) => (
                <PlayLine key={play.stateVersion} play={play} managers={managers} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
