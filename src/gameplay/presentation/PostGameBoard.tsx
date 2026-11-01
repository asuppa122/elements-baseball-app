import { buildPostGameSummary, type PostGameSummary, type RestConsequence } from '../postGameSummary'
import type { GameSide, GameState } from '../types'
import BoxScoreView from './BoxScoreView'

/**
 * Post-game tier one. Everything here comes from postGameSummary.ts, which
 * derives only what the finished game actually holds -- there is no batting box
 * because no batting line is tracked (GAMEPLAY_PRESENTATION_PLAN.md). Where the
 * data is not there, this says so on the surface rather than rendering a
 * convincing blank.
 */

function restDelta(prior: number, next: number): string {
  return prior === next ? `${next}` : `${prior} → ${next}`
}

/** A player's rest line is only worth showing if something about it moved. */
function restMoved(p: RestConsequence): boolean {
  return p.hitterAppeared || p.pitcherAppeared
    || p.priorHitterGamesRemaining !== p.hitterGamesRemaining
    || p.priorPitcherGamesRemaining !== p.pitcherGamesRemaining
}

function LineScore({ summary, managers }: { summary: PostGameSummary; managers: Record<GameSide, string> }) {
  const { away, home, innings, recorded } = summary.lineScore
  // An unrecorded line score is all zeroes, which reads exactly like a real
  // scoreless game. Dashes are the only honest rendering.
  const cell = (runs: number) => (recorded ? runs : '–')

  return (
    <div className="gp-postgame-linescore-wrap">
      <table className="gp-postgame-linescore">
        <thead>
          <tr>
            <th scope="col" className="gp-postgame-team"></th>
            {Array.from({ length: innings }, (_, i) => <th scope="col" key={i}>{i + 1}</th>)}
            <th scope="col" className="gp-postgame-total">R</th>
          </tr>
        </thead>
        <tbody>
          {(['away', 'home'] as GameSide[]).map((side) => (
            <tr key={side} className={summary.final.winner === side ? 'is-winner' : undefined}>
              <th scope="row" className="gp-postgame-team">{managers[side]}</th>
              {(side === 'away' ? away : home).map((runs, i) => <td key={i}>{cell(runs)}</td>)}
              <td className="gp-postgame-total">{summary.final[side]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!recorded && (
        <p className="gp-postgame-note">
          This game was played before per-inning runs were recorded, so only the final is known.
        </p>
      )}
    </div>
  )
}

export default function PostGameBoard({
  state,
  completedGamesThisSeason = { away: null, home: null },
  progression,
}: {
  state: GameState
  completedGamesThisSeason?: Record<GameSide, number | null>
  /** games.progression when the page knows it, for the Exhibition / Official tag. */
  progression?: string | null
}) {
  const summary = buildPostGameSummary(state, completedGamesThisSeason)
  const managers: Record<GameSide, string> = {
    away: state.managers.away.managerName,
    home: state.managers.home.managerName,
  }
  const winner = summary.final.winner

  return (
    <section className="gp-postgame" aria-label="Final result">
      <header className="gp-postgame-head">
        <span className="gp-postgame-status">
          FINAL{summary.final.inningsPlayed > 9 ? ` / ${summary.final.inningsPlayed}` : ''}
        </span>
        {summary.final.walkoff && <span className="gp-postgame-walkoff">WALK-OFF</span>}
      </header>

      <div className="gp-postgame-score">
        {(['away', 'home'] as GameSide[]).map((side) => (
          <div key={side} className={`gp-postgame-side${winner === side ? ' is-winner' : ''}`}>
            <span>{managers[side]}</span>
            <strong>{summary.final[side]}</strong>
          </div>
        ))}
      </div>

      <LineScore summary={summary} managers={managers} />

      {/* When a section is unavailable for BOTH sides it is one fact about the
          game, not two about the managers -- saying it twice side by side reads
          as an apology rather than information. */}
      {!summary.appearancesRecorded ? (
        <div className="gp-postgame-col">
          <h4>Pitching</h4>
          <p className="gp-postgame-note">
            This game was played before the engine recorded who pitched, so no pitching line can be
            built for it.
          </p>
        </div>
      ) : (
        <div className="gp-postgame-cols">
          {(['away', 'home'] as GameSide[]).map((side) => (
            <div className="gp-postgame-col" key={side}>
              <h4>{managers[side]} — Pitching</h4>
              {summary.pitching[side].length === 0
                ? <p className="gp-postgame-note">No pitching appearance was recorded for this game.</p>
                : (
                  <ul className="gp-postgame-list">
                    {summary.pitching[side].map((line) => (
                      <li key={line.cardKey}>
                        <span className="gp-postgame-name">{line.playerName}</span>
                        {/* One wrapping unit: a stat that wraps alone lands under the
                            NEXT player's name and reads as theirs. */}
                        <span className="gp-postgame-stats">
                          <span className="gp-postgame-stat">{line.inningsPitched} IP</span>
                          <span className="gp-postgame-stat">{line.runsAllowed} R</span>
                          {line.printedControl !== null && <span className="gp-postgame-muted">CTRL {line.printedControl}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          ))}
        </div>
      )}

      {/* The Elements-specific line: what this game costs each side going forward. */}
      {!summary.rest.away.available && !summary.rest.home.available ? (
        <div className="gp-postgame-col">
          <h4>Rest after this game</h4>
          <p className="gp-postgame-note">{summary.rest.home.available === false && summary.rest.home.reason === 'MISSING_REST_MILESTONES'
            ? 'Not shown: this game was played before the season\u2019s rest-milestone rule was frozen into it, so what it costs in availability cannot be worked out from the game itself.'
            : 'Not shown: the rest milestone step needs each manager\u2019s completed-game count for the season, which lives outside the game state. A wrong availability number would be worse than none.'}</p>
        </div>
      ) : (
      <div className="gp-postgame-cols">
        {(['away', 'home'] as GameSide[]).map((side) => {
          const projection = summary.rest[side]
          return (
            <div className="gp-postgame-col" key={side}>
              <h4>{managers[side]} — Rest after this game</h4>
              {!projection.available ? (
                <p className="gp-postgame-note">
                  Not shown: the milestone step needs this manager's completed-game count for the
                  season, which lives outside the game state. Showing a wrong availability number
                  would be worse than showing none.
                </p>
              ) : projection.players.filter(restMoved).length === 0 ? (
                <p className="gp-postgame-note">No player's availability changed.</p>
              ) : (
                <ul className="gp-postgame-list">
                  {projection.players.filter(restMoved).map((p) => (
                    <li key={p.cardKey}>
                      <span className="gp-postgame-name">{p.playerName}</span>
                      <span className="gp-postgame-stats">
                        {p.hitterAppeared || p.priorHitterGamesRemaining !== p.hitterGamesRemaining
                          ? <span className={`gp-postgame-stat${p.hitterGamesRemaining > 0 ? ' is-out' : ''}`}>
                              BAT {restDelta(p.priorHitterGamesRemaining, p.hitterGamesRemaining)}
                            </span>
                          : null}
                        {p.pitcherAppeared || p.priorPitcherGamesRemaining !== p.pitcherGamesRemaining
                          ? <span className={`gp-postgame-stat${p.pitcherGamesRemaining > 0 ? ' is-out' : ''}`}>
                              ARM {restDelta(p.priorPitcherGamesRemaining, p.pitcherGamesRemaining)}
                            </span>
                          : null}
                        {!p.hitterAppeared && !p.pitcherAppeared && <span className="gp-postgame-muted">did not play</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
      )}

      {/* Games with a play log get the full box score; older games say what is missing. */}
      {state.playLog?.start ? (
        <BoxScoreView state={state} progression={progression} managers={managers} />
      ) : (
        <p className="gp-postgame-note gp-postgame-footnote">
          No batting lines: this game was played before plays were recorded.
        </p>
      )}
    </section>
  )
}
