import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { computeGameStats, hasPlayRecord } from '../stats/gameStats'
import type { GameSide, GameState } from '../types'
import BoxScoreView, { STAT_DEFS } from './BoxScoreView'

/**
 * The box score during the game: the line score, then the batting, pitching,
 * Elements and play-by-play views, all from the play log as it stands now.
 * It covers the screen (the tables need the width) and closes back to the
 * game; nothing in it can act on the game.
 *
 * Portalled to the body: the game screen is a size container, which would
 * otherwise trap a fixed overlay inside it.
 */

const SIDES: GameSide[] = ['away', 'home']

function LineScore({ state }: { state: GameState }) {
  const recorded = hasPlayRecord(state)
  const team = recorded ? computeGameStats(state).team : null
  const byInning = (side: GameSide) => team?.[side].runsByInning ?? state.runsByInning?.[side] ?? []
  const innings = Math.max(9, state.inning, byInning('away').length, byInning('home').length)
  // An inning not yet batted is a dash, not a zero: the bottom of the inning
  // in progress, and every inning still to come.
  const batted = (side: GameSide, i: number) => {
    const inning = i + 1
    if (inning < state.inning) return true
    if (inning > state.inning) return false
    return side === 'away' || state.half === 'bottom'
  }

  return (
    <div className="gp-box-table-wrap">
      <table className="gp-box-table gp-live-linescore">
        <caption>Line score</caption>
        <thead>
          <tr>
            <th scope="col"></th>
            {Array.from({ length: innings }, (_, i) => <th scope="col" key={i}>{i + 1}</th>)}
            <th scope="col"><abbr title={`R — ${STAT_DEFS.R}`}>R</abbr></th>
            {team && <><th scope="col"><abbr title={`H — ${STAT_DEFS.H}`}>H</abbr></th><th scope="col"><abbr title={`LOB — ${STAT_DEFS.LOB}`}>LOB</abbr></th></>}
          </tr>
        </thead>
        <tbody>
          {SIDES.map((side) => (
            <tr key={side}>
              <th scope="row">{state.managers[side].managerName}</th>
              {Array.from({ length: innings }, (_, i) => <td key={i}>{batted(side, i) ? byInning(side)[i] ?? 0 : '–'}</td>)}
              <td className="is-total">{state.score[side]}</td>
              {team && <><td>{team[side].H}</td><td>{team[side].LOB}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function LiveBoxScore({ state, onClose }: { state: GameState; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); returnTo?.focus?.() }
  }, [onClose])

  return createPortal(
    <div className="gp-livebox" role="dialog" aria-modal="true" aria-label="Box score" onClick={onClose}>
      <div className="gp-livebox-sheet" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" className="gp-livebox-close" onClick={onClose} aria-label="Close box score">×</button>
        <LineScore state={state} />
        <BoxScoreView state={state} />
      </div>
    </div>,
    document.body,
  )
}
