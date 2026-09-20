import { battingSide } from '../gameBoundaryEngine'
import DefBar from './DefBar'
import GameField from './GameField'
import LineupRail from './LineupRail'
import MatchupPanel from './MatchupPanel'
import AvailabilityPanel from './AvailabilityPanel'
import RollControls from './RollControls'
import GameMenu from './GameMenu'
import GameLogPanel, { type LogEvent } from './GameLogPanel'
import HalfInningTransition from './HalfInningTransition'
import PostGameBoard from './PostGameBoard'
import DecisionBoard from './DecisionBoard'
import { narrate } from './playNarration'
import { getPrePitchActions } from '../decisionEngine'
import type { useGameplayActions } from './useGameplayActions'
import type { HalfInningTransition as HalfInningTransitionModel } from '../halfInningTransition'
import type { GameSide, GameState } from '../types'
import type { ReactNode } from 'react'

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
  let latest = null
  for (let i = events.length - 1; i >= 0 && !latest; i -= 1) latest = narrate(events[i])
  return (
    <div className="gp-topbar-recap">
      <b className="s-lbl">Play recap</b>
      {latest
        ? <p className={`gp-topbar-play is-${latest.kind}`}>{latest.text}</p>
        : <p className="gp-topbar-play is-empty">Play ball!</p>}
    </div>
  )
}

export default function GameplayScreenView({
  state, events, actions, transition, onDismissTransition, onExit, banner,
}: {
  state: GameState
  events: LogEvent[]
  actions: ReturnType<typeof useGameplayActions>
  transition: HalfInningTransitionModel | null
  onDismissTransition: () => void
  onExit: () => void
  banner?: ReactNode
}) {
  const {
    saving, error, notice, selection, toggleSelection, decision, editablePrePitchDecision,
    noPitch, rollPitch, rollSwing, startAction, changeAction, confirmDecision, rollDecision, togglePause,
  } = actions
  const prePitchActions = getPrePitchActions(state)
  // offence + defence calls belong in the left rail's decisions box; the five
  // roster moves stay in the rail until the bench/bullpen drawers land.
  const sideActions = prePitchActions.filter((a) => OFFENCE_ACTIONS.has(a.id) || DEFENCE_ACTIONS.has(a.id))
  const rosterActions = prePitchActions.filter((a) => !OFFENCE_ACTIONS.has(a.id) && !DEFENCE_ACTIONS.has(a.id))

  return (
    <main className={`gp-screen${decision ? ' has-decision' : ''}`}>
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
            onRollPitch={() => void rollPitch()}
            onRollSwing={() => void rollSwing()}
            onNoPitch={() => void noPitch()}
          />

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
        </section>

        {/* Centre is a transparent stack, not a panel — matching the artboards,
            where only the two rails are panels and the scorebug sits at the
            centre column's width rather than spanning the page. */}
        {/* Centre is strictly the game: score, the field, the defence. The
            matchup is the batter at the plate against the pitcher on the
            mound, so it needs no panel of its own. */}
        <section className="gp-region-field" aria-label="Field">
          <GameField state={state} />
          <DefBar state={state} />
        </section>

        <section className="gp-panel gp-region gp-region-rail" aria-label="Game rail">
          <GameLogPanel events={events} />

          {/* The decision board is the one already built and verified against
              both saved awaiting_decision games -- reused, not rewritten. */}
          <div className={`gp-decision-dock${decision ? ' is-open' : ''}`}>
            {decision && <i className="gp-sheet-grip" aria-hidden="true" />}
            {decision && (
              <DecisionBoard
                state={state}
                view={decision}
                selection={selection}
                /* The lab game is RLS-scoped to its home manager. */
                viewerSide="home"
                onToggle={(id) => toggleSelection(id, decision.mode === 'single')}
                onConfirm={() => void confirmDecision()}
                onRoll={() => void rollDecision()}
                saving={saving}
              />
            )}
            {decision && editablePrePitchDecision && (
              <button className="gp-action gp-action-secondary" disabled={saving} onClick={() => void changeAction()}>
                Change action
              </button>
            )}
          </div>

          {/* Roster moves only. These belong in the bench and bullpen drawers,
              which land with the right rail; until then they stay reachable
              here rather than disappearing. */}
          {!decision && state.status !== 'complete' && rosterActions.length > 0 && (
            <section className="gp-manager-actions" aria-label="Roster moves">
              <b className="s-lbl">Roster moves</b>
              <div className="gp-action-list">
                {rosterActions.map((a) => (
                  <button key={a.id} className="gp-action gp-action-secondary" disabled={saving}
                    title={a.detail} onClick={() => void startAction(a.id)}>{a.label}</button>
                ))}
              </div>
            </section>
          )}

          <AvailabilityPanel state={state} />

          {error && <p className="gp-actions-msg is-error">{error}</p>}
          {notice && !error && <p className="gp-actions-msg">{notice}</p>}

          {transition && !decision && (
            <HalfInningTransition
              transition={transition}
              managers={{ away: state.managers.away.managerName, home: state.managers.home.managerName }}
              onDismiss={onDismissTransition}
            />
          )}

          {!decision && state.status === 'complete' && <PostGameBoard state={state} />}
        </section>

      </div>
      </div>
    </main>
  )
}
