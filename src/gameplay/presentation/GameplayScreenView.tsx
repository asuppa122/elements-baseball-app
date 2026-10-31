import { battingSide } from '../gameBoundaryEngine'
import DefBar from './DefBar'
import GameField from './GameField'
import LineupRail from './LineupRail'
import MatchupPanel from './MatchupPanel'
import RosterDrawers from './RosterDrawers'
import RollControls from './RollControls'
import GameMenu from './GameMenu'
import { type LogEvent } from './GameLogPanel'
import { playOf } from './playRecord'
import { CardZoomProvider } from './CardZoom'
import RollResult from './RollResult'
import HalfInningTransition from './HalfInningTransition'
import PostGameBoard from './PostGameBoard'
import DecisionBoard from './DecisionBoard'
import { narrate } from './playNarration'
import { getPrePitchActions } from '../decisionEngine'
import { awaitingOffenseReady, sideToAct } from '../turnOrder'
import type { useGameplayActions } from './useGameplayActions'
import type { HalfInningTransition as HalfInningTransitionModel } from '../halfInningTransition'
import type { GameSide, GameState } from '../types'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import ManagerPanel from './ManagerPanel'
import ManagerToolbar, { type ManagerTool } from './ManagerToolbar'
import { useSquareField } from './useSquareField'

/**
 * The gameplay screen's layout, with no idea where its game came from.
 *
 * Two surfaces render this: the lab page, which loads from Supabase and writes
 * back to it, and the sandbox, which loads a frozen state and keeps changes in
 * the browser. Splitting load-and-save from draw is what lets an outside
 * reviewer play a real game without an account, and it means the remaining
 * port work happens once instead of twice.
 */

/**
 * The engine reports every legal pre-pitch action in ONE flat array with no
 * side tag (getPrePitchActions). They are not one list of buttons: steal and
 * the bunts belong to the offence, IBB and infield-in to the defence, and the
 * five roster moves belong wherever the roster lives -- the bench and bullpen
 * -- not in a decisions box. Sorting them is presentation's job.
 *
 * Anything unrecognised is treated as a roster move rather than silently
 * dropped, so a new engine action can never vanish from the screen.
 */
const OFFENCE_ACTIONS = new Set(['NATURAL_STEAL', 'SAC_BUNT', 'SQUEEZE_BUNT'])
const DEFENCE_ACTIONS = new Set(['INTENTIONAL_WALK', 'INFIELD_IN'])

/**
 * Whose move it is, said plainly. Only drawn in a two-player game -- in a
 * one-screen game the same person makes every move and it would be noise.
 */
function TurnStatus({ state, mine, toAct }: { state: GameState; mine: boolean; toAct: GameSide | null }) {
  if (state.status === 'complete') return <p className="gp-turn is-final">Final</p>
  if (state.status === 'paused') return <p className="gp-turn">Paused</p>
  if (!toAct) return null
  const what = state.pendingDecision ? 'decide'
    : awaitingOffenseReady(state) ? 'ready up'
    : state.waitingFor === 'PITCH_ROLL' ? 'pitch'
    : state.waitingFor === 'SWING_ROLL' ? 'swing' : 'move'
  return mine
    ? <p className="gp-turn is-mine" role="status">Your move — {what}</p>
    : <p className="gp-turn" role="status">Waiting on {state.managers[toAct].managerName} to {what}…</p>
}

function basesLabel(state: GameState): string {
  const on = [state.bases.first && '1st', state.bases.second && '2nd', state.bases.third && '3rd'].filter(Boolean)
  return on.length ? `Runners on ${on.join(', ')}` : 'Bases empty'
}

function Scorebug({ state }: { state: GameState }) {
  const batting = battingSide(state.half)
  const side = (which: GameSide) => (
    <div className={`gp-scorebug-side${which === 'home' ? ' is-home' : ''}${batting === which ? ' is-batting' : ''}`}>
      {which === 'home' && <b className="gp-scorebug-runs s-num">{state.score.home}</b>}
      <span className="gp-scorebug-name">{state.managers[which].managerName}</span>
      {which === 'away' && <b className="gp-scorebug-runs s-num">{state.score.away}</b>}
    </div>
  )

  return (
    <div className="gp-scorebug" aria-label="Score">
      {side('away')}
      <div className="gp-scorebug-centre">
        <span className="gp-scorebug-inning">
          {state.half === 'top' ? '▲' : '▼'} {state.inning}
        </span>
        {/* Bases at a glance. The runners themselves are pills on a 600px
            field, which is great for detail and poor for a quick read of
            "who's on" -- this is the quick read. */}
        <span className="gp-bases" aria-label={basesLabel(state)}>
          <i className={`gp-base is-second${state.bases.second ? ' is-on' : ''}`} />
          <i className={`gp-base is-third${state.bases.third ? ' is-on' : ''}`} />
          <i className={`gp-base is-first${state.bases.first ? ' is-on' : ''}`} />
        </span>
        <span className="gp-scorebug-outs" aria-label={`${state.outs} out`}>
          {[0, 1, 2].map((i) => <i key={i} className={`gp-out-dot${i < state.outs ? ' is-on' : ''}`} />)}
        </span>
      </div>
      {side('home')}
    </div>
  )
}

/**
 * The last thing that actually happened, in words. Only narrated events
 * qualify: a bare pitch roll is not a play, and older events recorded the
 * dice rather than the play, so they narrate to nothing and are skipped
 * rather than rendered as raw event types.
 */
function PlayRecap({ events }: { events: LogEvent[] }) {
  // events arrive OLDEST first -- GameLogPanel reverses them for display -- so
  // searching forwards finds the first play of the game, not the last one.
  // A play can take several steps (the hit, then the throw on the extra
  // base); every step of the latest plate appearance is read together.
  let text: string | null = null
  let kind = 'neutral'
  for (let i = events.length - 1; i >= 0 && text === null; i -= 1) {
    const play = playOf(events[i])
    if (play) {
      const steps = events.slice(0, i + 1).map(playOf).filter((p) => p && p.paKey === play.paKey)
      text = steps.flatMap((p) => p!.lines).join(' ')
      kind = steps.some((p) => p!.kind === 'scoring') ? 'scoring' : play.kind
    } else {
      const n = narrate(events[i])
      if (n) { text = n.text; kind = n.kind }
    }
  }
  return (
    <div className="gp-topbar-recap">
      <b className="s-lbl">Play recap</b>
      {text
        ? <p className={`gp-topbar-play is-${kind}`}>{text}</p>
        : <p className="gp-topbar-play is-empty">Play ball!</p>}
    </div>
  )
}

export default function GameplayScreenView({
  state, events, actions, transition, onDismissTransition, onExit, banner, viewerSide = 'home', actingSides,
}: {
  state: GameState
  events: LogEvent[]
  actions: ReturnType<typeof useGameplayActions>
  transition: HalfInningTransitionModel | null
  onDismissTransition: () => void
  onExit: () => void
  banner?: ReactNode
  /**
   * Which manager the viewer is acting as. The lab game is RLS-scoped to its
   * home manager, so that is the default. The sandbox has no opponent and
   * passes the acting side instead, otherwise a defensive call like an
   * intentional walk opens a board the reviewer cannot touch.
   */
  viewerSide?: GameSide
  /**
   * Teams the viewer can make roster moves for. A league game is managed one
   * side per person, so it defaults to the viewer's own; the sandbox is one
   * reviewer playing both, and passes both.
   */
  actingSides?: GameSide[]
}) {
  const {
    saving, error, notice, selection, toggleSelection, decision, editablePrePitchDecision,
    noPitch, declareReady, rollPitch, rollSwing, startAction, changeAction, confirmDecision, rollDecision, togglePause,
  } = actions
  const acting = actingSides ?? [viewerSide]
  const fieldColumn = useRef<HTMLElement>(null)
  useSquareField(fieldColumn)
  // Two managers at two screens: each sees only their own calls and buttons,
  // and only on their turn (turnOrder.ts). A one-screen game is one person
  // playing both sides, so nothing is gated there.
  const twoPlayer = state.turnHandshake === true
  const toAct = sideToAct(state)
  const myTurn = !twoPlayer || (toAct !== null && acting.includes(toAct))
  const batting = battingSide(state.half)
  const ownerOf = (id: string): GameSide => (OFFENCE_ACTIONS.has(id) ? batting : batting === 'home' ? 'away' : 'home')
  const prePitchActions = getPrePitchActions(state)
  // offence + defence calls belong in the left rail's decisions box; the
  // roster moves belong to the bench and bullpen drawers.
  const sideActions = prePitchActions.filter((a) => (OFFENCE_ACTIONS.has(a.id) || DEFENCE_ACTIONS.has(a.id))
    && (!twoPlayer || acting.includes(ownerOf(a.id))))
  const rosterActions = prePitchActions.filter((a) => !OFFENCE_ACTIONS.has(a.id) && !DEFENCE_ACTIONS.has(a.id))

  // Elements 2.0: the manager's tools open in one panel over the matchup
  // column, never over the field. What it shows, in order: your decision; a
  // tool you opened from the toolbar; the final box score; the half-inning
  // summary. Nothing is open the rest of the time, and opening or closing it
  // never moves the field or the cards.
  const [tool, setTool] = useState<ManagerTool | null>(null)
  const [finalDismissed, setFinalDismissed] = useState(false)
  const decisionMine = Boolean(decision) && (!twoPlayer || acting.includes(decision!.actingSide))
  const decisionId = state.pendingDecision?.id ?? null
  // A new decision takes the panel back from whatever tool was open -- this is
  // also how "Bring in" from the bullpen lands on its decision board.
  useEffect(() => { setTool(null) }, [decisionId])
  const drawerTool = tool === 'log' || tool === 'pen' || tool === 'bench' ? tool : null
  const panel: 'decision' | 'drawers' | 'final' | 'transition' | null =
    decision && ((decisionMine && !drawerTool) || tool === 'call') ? 'decision'
    : drawerTool ? 'drawers'
    : state.status === 'complete' && (tool === 'final' || !finalDismissed) ? 'final'
    : transition && !decision ? 'transition'
    : null
  // A notice (not an error) floats over the bottom of the matchup column, so
  // it fades after a few seconds rather than sitting over the calls.
  const [noticeShown, setNoticeShown] = useState('')
  useEffect(() => {
    setNoticeShown(notice)
    if (!notice) return
    const timer = window.setTimeout(() => setNoticeShown(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])
  const toggleTool = (next: ManagerTool) => {
    if (next === 'final') setFinalDismissed(false)
    setTool((current) => (current === next ? null : next))
  }

  return (
    <CardZoomProvider>
    <main className={`gp-screen${panel ? ' has-panel' : ''}${panel === 'decision' ? ' has-decision' : ''}`}>
      <div className="gp-stage">
      {banner}

      {/* One full-width header, matching the artboards: the whole game
          situation reads left to right in a single row, and the centre
          column below is strictly the field. */}
      <header className="gp-panel gp-topbar" aria-label="Game situation">
        <Scorebug state={state} />
        <i className="gp-topbar-rule" aria-hidden="true" />
        <PlayRecap events={events} />
        <i className="gp-topbar-rule" aria-hidden="true" />
        {twoPlayer && <TurnStatus state={state} mine={myTurn} toAct={toAct} />}
        <div className="gp-topbar-fielding">
          <b className="s-lbl">Fielding</b>
          <p>{state.managers[battingSide(state.half) === 'home' ? 'away' : 'home'].managerName}</p>
        </div>
        <GameMenu
          state={state}
          saving={saving}
          onTogglePause={() => void togglePause()}
          onExit={onExit}
        />
      </header>

      <div className="gp-layout">
        {/* The left rail is the manager's column: who is up, the roll, who is
            pitching, the batting order, and the calls available right now. */}
        <section className="gp-region gp-region-lineup" aria-label="Matchup and lineup">
          <MatchupPanel state={state} />

          <RollControls
            state={state}
            saving={saving}
            hasDecision={Boolean(decision)}
            canAct={myTurn}
            waitingOn={twoPlayer && !myTurn && toAct ? state.managers[toAct].managerName : null}
            onReady={() => void declareReady()}
            onRollPitch={() => void rollPitch()}
            onRollSwing={() => void rollSwing()}
            onNoPitch={() => void noPitch()}
          />

          <RollResult events={events} />

          <div className="gp-panel gp-lineup-strip">
            <LineupRail state={state} />
          </div>

          {/* Only the calls legal for this state render at all. An action
              belonging to the other manager is not shown disabled -- that is
              permanent noise on a screen you look at every pitch. The box
              keeps a fixed height so the Type 2 board does not shift between
              pitches as calls come and go. */}
          <section className="gp-panel gp-calls" aria-label="Manager decisions">
            <b className="s-lbl">Manager decisions</b>
            <div className="gp-calls-list">
              {sideActions.map((a) => (
                <button key={a.id} className="gp-action gp-action-secondary" disabled={saving}
                  title={a.detail} onClick={() => void startAction(a.id)}>{a.label}</button>
              ))}
            </div>
            {sideActions.length === 0 && <p className="gp-calls-rest">No decisions this pitch.</p>}
          </section>

          {panel === 'decision' && decision && (
            <ManagerPanel state={state} title={decision.title}
              onClose={tool === 'call' && !decisionMine ? () => setTool(null) : undefined}
              footer={editablePrePitchDecision && decisionMine ? (
                <button className="gp-action gp-action-secondary" disabled={saving} onClick={() => void changeAction()}>
                  Change action
                </button>
              ) : undefined}>
              <DecisionBoard
                state={state}
                view={decision}
                selection={selection}
                // Whoever is playing this side from this screen decides: in a
                // one-screen game that is both sides.
                viewerSide={acting.includes(decision.actingSide) ? decision.actingSide : viewerSide}
                onToggle={(id) => toggleSelection(id, decision.mode === 'single')}
                onConfirm={() => void confirmDecision()}
                onRoll={() => void rollDecision()}
                saving={saving}
              />
            </ManagerPanel>
          )}
          {panel === 'drawers' && drawerTool && (
            <ManagerPanel state={state} title={drawerTool === 'log' ? 'Game log' : drawerTool === 'pen' ? 'Bullpen' : 'Bench'}
              onClose={() => setTool(null)}>
              {/* Game log, bullpen and bench as one accordion, opened at the
                  tool chosen. Roster moves start from the player they are
                  about to use and finish on the decision board; nothing is
                  made on a single click. */}
              <RosterDrawers
                key={drawerTool}
                initialOpen={drawerTool}
                state={state}
                events={events}
                viewerSide={viewerSide}
                actingSides={acting}
                rosterActions={rosterActions}
                disabled={saving || Boolean(decision)}
                onStart={(id, prefer) => void startAction(id, prefer)}
              />
            </ManagerPanel>
          )}
          {panel === 'final' && (
            <ManagerPanel state={state} title="Final" onClose={() => { setFinalDismissed(true); setTool(null) }}>
              <PostGameBoard state={state} />
            </ManagerPanel>
          )}
          {panel === 'transition' && transition && (
            <ManagerPanel state={state} title="Half-inning summary" onClose={onDismissTransition}>
              <HalfInningTransition
                transition={transition}
                managers={{ away: state.managers.away.managerName, home: state.managers.home.managerName }}
                onDismiss={onDismissTransition}
              />
            </ManagerPanel>
          )}

          {/* While a panel is open it already says what is happening, so only
              an error is worth interrupting it for. */}
          {(error || (noticeShown && !panel)) && (
            <p className={`gp-toast${error ? ' is-error' : ''}`} role="status">{error || noticeShown}</p>
          )}
        </section>

        {/* Centre is a transparent stack, not a panel — matching the artboards,
            where only the two rails are panels and the scorebug sits at the
            centre column's width rather than spanning the page. */}
        {/* Centre is strictly the game: score, the field, the defence. The
            matchup is the batter at the plate against the pitcher on the
            mound, so it needs no panel of its own. */}
        <section className="gp-region-field" aria-label="Field" ref={fieldColumn}>
          <GameField state={state} />
          <DefBar state={state} />
        </section>

        <section className="gp-region gp-region-rail" aria-label="Manager tools">
          <ManagerToolbar
            state={state}
            events={events}
            open={panel === 'decision' ? 'call' : panel === 'drawers' ? drawerTool : panel === 'final' ? 'final' : null}
            onOpen={toggleTool}
            decisionPending={Boolean(decision)}
            decisionMine={decisionMine}
            viewerSide={viewerSide}
            actingSides={acting}
          />
        </section>

      </div>
      </div>
    </main>
    </CardZoomProvider>
  )
}
