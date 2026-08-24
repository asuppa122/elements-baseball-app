import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { resolvePitchRoll, resolveSwingRoll , effectiveCurrentHitterOnBase, effectiveCurrentPitcherControl, pitcherAdvantageIsAutomatic, resolveAutomaticPitcherAdvantage } from '../gameplay/engine'
import {
  hasGameplayLabAccess,
  loadGameplayLabEvents,
  loadGameplayLabGame,
  saveGameplayLabState,
  type PersistedGameplayLabGame,
} from '../gameplay/gameRepository'
import type { GameSide, GameState } from '../gameplay/types'
import { resolveSwingChart } from '../gameplay/coreGame'
import {
  beginPrePitchDecision,
  confirmManagerDecision,
  getDecisionView,
  getPrePitchActions,
  resolveDecisionRoll, noWheelSacBuntOutcome,
} from '../gameplay/decisionEngine'

function sideLabel(side: GameSide) { return side === 'home' ? 'HOME' : 'AWAY' }

function Diamond({ state }: { state: GameState }) {
  const runner = (base: 'first' | 'second' | 'third') => state.bases[base]?.playerName ?? ''
  return (
    <div className="retro-diamond" aria-label="Baserunners">
      <div className={`retro-base second ${runner('second') ? 'on' : ''}`}><span>2B</span><b>{runner('second')}</b></div>
      <div className={`retro-base third ${runner('third') ? 'on' : ''}`}><span>3B</span><b>{runner('third')}</b></div>
      <div className={`retro-base first ${runner('first') ? 'on' : ''}`}><span>1B</span><b>{runner('first')}</b></div>
      <div className="retro-home">HOME</div>
    </div>
  )
}

export default function GameplayPlayableShellPage() {
  const { gameId = '' } = useParams()
  const navigate = useNavigate()
  const { user, isDemo } = useAuth()
  const [game, setGame] = useState<PersistedGameplayLabGame | null>(null)
  const [events, setEvents] = useState<Array<{state_version:number;event_type:string;payload:Record<string,unknown>;created_at:string}>>([])
  const [selection, setSelection] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function refreshEvents(id: string) { setEvents(await loadGameplayLabEvents(id)) }

  useEffect(() => {
    if (!gameId || !user || isDemo) { setLoading(false); return }
    let cancelled = false
    async function load() {
      try {
        if (!await hasGameplayLabAccess()) throw new Error('Playable shell access is not enabled for this account.')
        const loaded = await loadGameplayLabGame(gameId)
        let loadedEvents: Array<{state_version:number;event_type:string;payload:Record<string,unknown>;created_at:string}> = []
        try {
          loadedEvents = await loadGameplayLabEvents(gameId)
        } catch (eventError) {
          // A newly-created game may not have readable event history yet. Event history is
          // supplemental to the playable shell, so do not block the game from loading.
          console.warn('Playable shell loaded game but could not load event history.', eventError)
        }
        if (!cancelled) { setGame(loaded); setEvents(loadedEvents) }
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : (typeof e === 'object' && e && 'message' in e ? String((e as {message?:unknown}).message) : 'Could not load playable shell.')
          setError(message)
        }
      }
      finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [gameId, user?.id, isDemo])

  const state = game?.game_state as GameState | undefined
  useEffect(() => setSelection([]), [state?.pendingDecision?.id])
  const offense: GameSide = state?.half === 'bottom' ? 'home' : 'away'
  const defense: GameSide = offense === 'home' ? 'away' : 'home'
  const batter = useMemo(() => state?.plateAppearance.batterCardKey ? state.pregame[offense].roster?.cards[state.plateAppearance.batterCardKey] ?? null : null, [state, offense])
  const pitcher = useMemo(() => state?.plateAppearance.pitcherCardKey ? state.pregame[defense].roster?.cards[state.plateAppearance.pitcherCardKey] ?? null : null, [state, defense])
  const decision = state ? getDecisionView(state) : null
  const prePitchActions = state ? getPrePitchActions(state) : []
  const editablePrePitchDecision = Boolean(state?.pendingDecision && ['PINCH_HITTER_SELECTION','PINCH_RUNNER_TARGET','PINCH_RUNNER_REPLACEMENT','DEF_SUB_POSITION','DEF_SUB_REPLACEMENT','DOUBLE_SWITCH_PITCHER','DOUBLE_SWITCH_FIELDER','DOUBLE_SWITCH_OUTGOING_FIELDER','ENTRY_ATTRIBUTE_MODE'].includes(state.pendingDecision.decisionType))
  const finalSubstitutionCommit = state?.pendingDecision?.decisionType === 'ENTRY_ATTRIBUTE_MODE'

  function d20() { const values = new Uint32Array(1); crypto.getRandomValues(values); return (values[0] % 20) + 1 }

  async function persist(next: GameState, eventType: Parameters<typeof saveGameplayLabState>[0]['eventType'], payload: Record<string, unknown>, message: string) {
    if (!game) return
    setSaving(true); setError(''); setNotice('')
    try {
      const saved = await saveGameplayLabState({ gameId: game.id, expectedStateVersion: game.state_version, nextState: next, eventType, eventPayload: payload })
      setGame(saved); await refreshEvents(game.id); setNotice(message)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save game state.') }
    finally { setSaving(false) }
  }

  async function noPitch() {
    if (!state) return
    const next = resolveAutomaticPitcherAdvantage(state)
    await persist(next, 'DECISION_RESOLVED', { resolutionKind: 'AUTOMATIC_PITCHER_ADVANTAGE', automatic: true, playableShell: true }, 'NO PITCH — PITCHER ADVANTAGE.')
  }

  async function rollPitch() {
    if (!state) return
    const roll = d20(); const next = resolvePitchRoll(state, roll)
    await persist(next, 'PITCH_ROLLED', { roll, playableShell: true }, `Pitch roll: ${roll}. ${next.plateAppearance.advantage?.toUpperCase()} advantage.`)
  }

  async function rollSwing() {
    if (!state) return
    const roll = d20(); const result = resolveSwingChart(state, roll); const next = resolveSwingRoll(state, roll)
    await persist(next, 'SWING_RESOLVED', { roll, chartResult: result, playableShell: true }, `Swing roll: ${roll} → ${result}.`)
  }

  async function startAction(actionId: string) {
    if (!state) return
    const next = beginPrePitchDecision(state, actionId); next.stateVersion = state.stateVersion + 1; next.updatedAt = new Date().toISOString()
    await persist(next, 'DECISION_RESOLVED', { resolutionKind: 'PRE_PITCH_ACTION_STARTED', action: actionId, playableShell: true }, `${actionId.replaceAll('_',' ')} started.`)
  }

  async function changeAction() {
    if (!state || !editablePrePitchDecision) return
    const next: GameState = { ...state, status: 'in_progress', waitingFor: 'PITCH_ROLL', pendingDecision: null, nextActor: defense, stateVersion: state.stateVersion + 1, updatedAt: new Date().toISOString() }
    await persist(next, 'DECISION_RESOLVED', { resolutionKind: 'PRE_PITCH_ACTION_CANCELLED', playableShell: true }, 'Action cleared. Choose a different manager action.')
    setSelection([])
  }

  async function confirmDecision() {
    if (!state || !decision) return
    const next = confirmManagerDecision(state, selection); next.stateVersion = state.stateVersion + 1; next.updatedAt = new Date().toISOString()
    const message = finalSubstitutionCommit ? 'Decision locked.' : editablePrePitchDecision ? 'Selection saved. You can still change the action before final confirmation.' : 'Decision locked.'
    await persist(next, 'DECISION_RESOLVED', { decisionType: state.pendingDecision?.decisionType, selected: selection, playableShell: true }, message)
    setSelection([])
  }

  async function rollDecision() {
    if (!state || !decision) return
    const roll = d20(); const next = resolveDecisionRoll(state, roll); next.stateVersion = state.stateVersion + 1; next.updatedAt = new Date().toISOString()
    const buntOutcome = state.pendingDecision?.decisionType === 'SAC_BUNT_RTS' ? noWheelSacBuntOutcome(roll) : null
    const message = buntOutcome === 'FAILED_PITCHER_CHART' ? `Bunt roll: ${roll} — FAILED BUNT. Attempt swing on PITCHER chart.` : buntOutcome === 'STRIKEOUT' ? `Bunt roll: ${roll} — K.` : buntOutcome === 'LEAD_RUNNER_OUT' ? `Bunt roll: ${roll} — lead runner OUT.` : buntOutcome === 'SUCCESS' ? `Bunt roll: ${roll} — bunt successful; runners advance.` : state.pendingDecision?.decisionType === 'GB_RUNNER_2B_RTH' ? `RTH roll: ${roll} — ${roll <= 10 ? 'runner advances to 3B' : 'runner stays at 2B'}.` : `Decision roll: ${roll}.`
    await persist(next, 'DECISION_RESOLVED', { decisionType: state.pendingDecision?.decisionType, resolutionKind: 'ROLL', roll, playableShell: true }, message)
  }

  if (loading) return <main className="retro-game-page"><div className="retro-loading">LOADING GAME…</div></main>
  if (!state || !game) return <main className="retro-game-page"><div className="retro-loading">{error || 'GAME NOT FOUND'}</div></main>

  const initialized = Boolean(state.plateAppearance.batterCardKey && state.plateAppearance.pitcherCardKey)
  if (!initialized) return (
    <main className="retro-game-page"><div className="retro-loading"><b>GAME NOT INITIALIZED</b><span>Use the existing developer state screen to initialize the current fixture first.</span><button onClick={() => navigate(`/games/lab/${game.id}/state`)}>OPEN DEVELOPER STATE</button></div></main>
  )

  const actingSide = decision?.actingSide ?? state.nextActor ?? defense
  const recent = events.slice(-6).reverse()

  return (
    <main className="retro-game-page">
      <div className="retro-game-shell">
        <header className="retro-scoreboard">
          <div className="retro-team"><span>AWAY</span><strong>{state.managers.away.managerName}</strong><b>{state.score.away}</b></div>
          <div className="retro-inning"><strong>{state.half === 'top' ? '▲' : '▼'} {state.inning}</strong><span>{state.outs} OUT{state.outs === 1 ? '' : 'S'}</span></div>
          <div className="retro-team home"><b>{state.score.home}</b><strong>{state.managers.home.managerName}</strong><span>HOME</span></div>
        </header>

        <section className="retro-field-panel"><Diamond state={state} /></section>

        <section className="retro-matchup">
          <div><span>BATTER</span><strong>{batter?.playerName ?? '—'}</strong><small>OB {effectiveCurrentHitterOnBase(state)} · BSR {batter?.hitter.baserunning ?? '—'}</small></div>
          <div className="retro-vs">VS</div>
          <div><span>PITCHER</span><strong>{pitcher?.playerName ?? '—'}</strong><small>CTRL {effectiveCurrentPitcherControl(state)} · IP {pitcher?.pitcher.ip ?? '—'}</small></div>
        </section>

        <section className="retro-action-panel">
          <div className="retro-turn">{sideLabel(actingSide)} MANAGER TURN</div>
          {error && <div className="retro-message error">{error}</div>}
          {notice && <div className="retro-message">{notice}</div>}

          {!decision && state.status === 'complete' && <div className="retro-result"><strong>FINAL</strong><span>{state.managers.away.managerName} {state.score.away} · {state.managers.home.managerName} {state.score.home}</span></div>}

          {!decision && state.status !== 'complete' && state.waitingFor === 'PITCH_ROLL' && (
            <>
              <div className="retro-roll-readout"><span>PITCH</span><b>{state.plateAppearance.pitchRoll ?? '—'}</b><span>ADV</span><b>{state.plateAppearance.advantage?.toUpperCase() ?? '—'}</b></div>
              {pitcherAdvantageIsAutomatic(state) ? <button className="retro-primary" disabled={saving} onClick={() => void noPitch()}>NO PITCH — PITCHER ADVANTAGE</button> : <button className="retro-primary" disabled={saving} onClick={() => void rollPitch()}>ROLL PITCH</button>}
              {prePitchActions.length > 0 && <div className="retro-manager-actions">{prePitchActions.map((action) => <button key={action.id} disabled={saving} onClick={() => void startAction(action.id)}>{action.label}</button>)}</div>}
            </>
          )}

          {!decision && state.status !== 'complete' && state.waitingFor === 'SWING_ROLL' && (
            <><div className="retro-roll-readout"><span>PITCH</span><b>{state.plateAppearance.pitchRoll ?? '—'}</b><span>ADV</span><b>{state.plateAppearance.advantage?.toUpperCase() ?? '—'}</b></div><button className="retro-primary" disabled={saving} onClick={() => void rollSwing()}>ROLL SWING</button></>
          )}

          {decision && (
            <div className="retro-decision">
              <h2>{decision.title}</h2><p>{decision.description}</p>
              {editablePrePitchDecision && <button className="retro-secondary" disabled={saving} onClick={() => void changeAction()}>CHANGE ACTION</button>}
              {decision.mode === 'roll' ? <button className="retro-primary" disabled={saving} onClick={() => void rollDecision()}>ROLL d20</button> : (
                <>
                  <div className="retro-options">{decision.options.map((option) => {
                    const selected = selection.includes(option.id)
                    return <button key={option.id} className={selected ? 'selected' : ''} disabled={saving} onClick={() => setSelection((current) => decision.mode === 'single' ? [option.id] : current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id])}><strong>{option.label}</strong><small>{option.detail}</small></button>
                  })}</div>
                  <button className="retro-primary" disabled={saving || selection.length === 0} onClick={() => void confirmDecision()}>{decision.confirmationLabel || 'CONFIRM'}</button>
                </>
              )}
            </div>
          )}
        </section>

        <section className="retro-log"><header><span>GAME LOG</span><button onClick={() => navigate('/games')}>EXIT TO GAMES</button></header>{recent.length === 0 ? <p>No saved events yet.</p> : recent.map((event) => <div key={`${event.state_version}-${event.event_type}`}><b>v{event.state_version}</b> {event.event_type.replaceAll('_',' ')}</div>)}</section>
      </div>
    </main>
  )
}
