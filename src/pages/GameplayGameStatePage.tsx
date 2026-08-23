import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  pauseGame,
  preparePrivateLabOpponentFixture,
  resumeGame,
  resolvePitchRoll,
  resolveSwingRoll,
  startGame,
} from '../gameplay/engine'
import {
  hasGameplayLabAccess,
  loadGameplayLabGame,
  loadGameplayLabEvents,
  saveGameplayLabState,
  type PersistedGameplayLabGame,
} from '../gameplay/gameRepository'
import type { GameSide, GameState } from '../gameplay/types'
import { resolveForDevelopmentHarness, resolveSwingChart } from '../gameplay/coreGame'
import { beginPrePitchDecision, confirmManagerDecision, getDecisionView, getPrePitchActions, resolveDecisionRoll } from '../gameplay/decisionEngine'
import { runCoreGameHarness, runDecisionStressHarness, type DecisionStressReport, type HarnessReport } from '../gameplay/testHarness'
import { runNonGbScenarioMatrix, type ScenarioReport } from '../gameplay/scenarioHarness'
import { runGroundBallScenarioMatrix } from '../gameplay/groundBallScenarioHarness'
import { runFatigueScenarioMatrix } from '../gameplay/fatigueScenarioHarness'
import { runGameBoundaryScenarioMatrix } from '../gameplay/gameBoundaryScenarioHarness'

function sideLabel(side: GameSide) {
  return side === 'away' ? 'Away' : 'Home'
}

function BaseDiamond({ bases }: { bases: GameState['bases'] }) {
  const base = (runner: GameState['bases']['first'], position: 'first' | 'second' | 'third', label: string) => (
    <div
      className={`gameplay-base gameplay-base-${position} ${runner ? 'occupied' : ''}`}
      title={runner ? `${runner.playerName} · BSR ${runner.baserunning ?? '—'} · SB ${runner.stolenBase ?? '—'}` : `${label} empty`}
      aria-label={runner ? `${label}: ${runner.playerName}` : `${label}: empty`}
    >
      <span className="gameplay-base-shape" />
      <small>{label}</small>
      {runner && <strong>{runner.playerName}</strong>}
    </div>
  )

  return (
    <div className="gameplay-base-diamond" aria-label="Current baserunners">
      {base(bases.second, 'second', '2B')}
      {base(bases.third, 'third', '3B')}
      {base(bases.first, 'first', '1B')}
      <div className="gameplay-home-plate"><span /> <small>HOME</small></div>
    </div>
  )
}

export default function GameplayGameStatePage() {
  const { gameId = '' } = useParams()
  const navigate = useNavigate()
  const { user, isDemo } = useAuth()
  const [game, setGame] = useState<PersistedGameplayLabGame | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [events, setEvents] = useState<Array<{state_version:number;event_type:string;payload:Record<string,unknown>;created_at:string}>>([])
  const [harness, setHarness] = useState<HarnessReport | null>(null)
  const [decisionSelection, setDecisionSelection] = useState<string[]>([])
  const [harnessRunning, setHarnessRunning] = useState(false)
  const [harnessError, setHarnessError] = useState('')
  const [decisionStress, setDecisionStress] = useState<DecisionStressReport | null>(null)
  const [decisionStressRunning, setDecisionStressRunning] = useState(false)
  const [decisionStressSimulations, setDecisionStressSimulations] = useState<100 | 1000 | 5000>(100)
  const [decisionStressError, setDecisionStressError] = useState('')
  const [scenarioReport, setScenarioReport] = useState<ScenarioReport | null>(null)
  const [scenarioRunning, setScenarioRunning] = useState(false)
  const [gbScenarioReport, setGbScenarioReport] = useState<ScenarioReport | null>(null)
  const [gbScenarioError, setGbScenarioError] = useState('')
  const [gbScenarioRunning, setGbScenarioRunning] = useState(false)
  const [scenarioError, setScenarioError] = useState('')
  const [fatigueScenarioReport, setFatigueScenarioReport] = useState<ScenarioReport | null>(null)
  const [fatigueScenarioError, setFatigueScenarioError] = useState('')
  const [fatigueScenarioRunning, setFatigueScenarioRunning] = useState(false)
  const [boundaryScenarioReport, setBoundaryScenarioReport] = useState<ScenarioReport | null>(null)
  const [boundaryScenarioError, setBoundaryScenarioError] = useState('')
  const [boundaryScenarioRunning, setBoundaryScenarioRunning] = useState(false)

  async function reload() {
    const [loaded, loadedEvents] = await Promise.all([loadGameplayLabGame(gameId), loadGameplayLabEvents(gameId)])
    setGame(loaded)
    setEvents(loadedEvents)
    return loaded
  }

  useEffect(() => {
    if (!gameId || !user || isDemo) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const allowed = await hasGameplayLabAccess()
        if (!allowed) throw new Error('Gameplay lab access is not enabled for this account.')
        const [loaded, loadedEvents] = await Promise.all([loadGameplayLabGame(gameId), loadGameplayLabEvents(gameId)])
        if (!cancelled) { setGame(loaded); setEvents(loadedEvents) }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load game state.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [gameId, user?.id, isDemo])

  const state = game?.game_state as GameState | undefined
  useEffect(() => { setDecisionSelection([]) }, [state?.pendingDecision?.id])

  const offense: GameSide = state?.half === 'bottom' ? 'home' : 'away'
  const defense: GameSide = offense === 'away' ? 'home' : 'away'
  const batter = useMemo(() => {
    if (!state?.plateAppearance.batterCardKey) return null
    return state.pregame[offense].roster?.cards[state.plateAppearance.batterCardKey] ?? null
  }, [state, offense])
  const pitcher = useMemo(() => {
    if (!state?.plateAppearance.pitcherCardKey) return null
    return state.pregame[defense].roster?.cards[state.plateAppearance.pitcherCardKey] ?? null
  }, [state, defense])

  async function initialize() {
    if (!game || !state) return
    setSaving(true); setError(''); setSuccess('')
    try {
      // Private Phase 1D fixture: copy Anthony's validated locked baseball setup to
      // the disabled opponent side, then start through the real engine.
      const ready = preparePrivateLabOpponentFixture(state)
      const readySaved = await saveGameplayLabState({
        gameId: game.id,
        expectedStateVersion: game.state_version,
        nextState: ready,
        eventType: 'GAME_READY',
        eventPayload: { privateLabOpponentFixture: true },
      })
      const started = startGame(readySaved.game_state as GameState)
      const startedSaved = await saveGameplayLabState({
        gameId: game.id,
        expectedStateVersion: readySaved.state_version,
        nextState: started,
        eventType: 'GAME_STARTED',
        eventPayload: {
          privateLabOpponentFixture: true,
          inning: 1,
          half: 'top',
          outs: 0,
          waitingFor: 'PITCH_ROLL',
        },
      })
      setGame(startedSaved)
      setSuccess('Top 1st initialized. Refresh this page now: every value below should persist exactly.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not initialize the game.')
    } finally {
      setSaving(false)
    }
  }

  function rollD20(): number {
    const values = new Uint32Array(1)
    crypto.getRandomValues(values)
    return (values[0] % 20) + 1
  }

  async function beginManagerAction(actionId: string) {
    if (!game || !state) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const next = beginPrePitchDecision(state, actionId)
      next.stateVersion = state.stateVersion + 1
      next.updatedAt = new Date().toISOString()
      const saved = await saveGameplayLabState({
        gameId: game.id, expectedStateVersion: game.state_version, nextState: next,
        eventType: 'DECISION_RESOLVED',
        eventPayload: { resolutionKind:'PRE_PITCH_ACTION_STARTED', action: actionId, nextDecision: next.pendingDecision?.decisionType ?? null },
      })
      setGame(saved); setEvents(await loadGameplayLabEvents(game.id)); setDecisionSelection([])
      setSuccess(`${actionId.replaceAll('_',' ')} started. Select and confirm the manager choice.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start the manager action.') }
    finally { setSaving(false) }
  }

  async function rollPitch() {
    if (!game || !state) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const roll = rollD20()
      const next = resolvePitchRoll(state, roll)
      const offense: GameSide = state.half === 'top' ? 'away' : 'home'
      const defense: GameSide = state.half === 'top' ? 'home' : 'away'
      const batterKey = state.plateAppearance.batterCardKey
      const pitcherKey = state.plateAppearance.pitcherCardKey
      const batterCard = batterKey ? state.pregame[offense].roster?.cards[batterKey] : null
      const pitcherCard = pitcherKey ? state.pregame[defense].roster?.cards[pitcherKey] : null
      const isDefaultBatter = batterKey ? state.pregame[offense].defaultBatterCardKeys.includes(batterKey) || batterCard?.hitter.onBase == null : false
      const isDefaultPitcher = pitcherKey ? (state.pregame[defense].defaultPitcherCardKeys?.includes(pitcherKey) ?? false) || pitcherCard?.pitcher.control == null : false
      const effectiveOnBase = isDefaultBatter ? 5 : batterCard?.hitter.onBase ?? null
      const effectiveControl = isDefaultPitcher ? -5 : pitcherCard?.pitcher.control ?? null

      const saved = await saveGameplayLabState({
        gameId: game.id,
        expectedStateVersion: game.state_version,
        nextState: next,
        eventType: 'PITCH_ROLLED',
        eventPayload: {
          roll,
          pitcherCardKey: pitcherKey,
          pitcherName: pitcherCard?.playerName ?? null,
          control: effectiveControl,
          pitchTotal: next.plateAppearance.pitchTotal,
          batterCardKey: batterKey,
          batterName: batterCard?.playerName ?? null,
          onBase: effectiveOnBase,
          defaultBatter: isDefaultBatter,
          advantage: next.plateAppearance.advantage,
          tieResolvedByPlatoon: next.plateAppearance.pitchTotal === effectiveOnBase,
        },
      })
      setGame(saved)
      setSuccess(`Pitch ${roll} persisted. ${next.plateAppearance.advantage === 'pitcher' ? 'Pitcher' : 'Hitter'} advantage is locked for this plate appearance. Refresh now to verify it does not reroll.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resolve the pitch roll.')
    } finally {
      setSaving(false)
    }
  }

  async function rollSwing() {
    if (!game || !state) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const roll = rollD20()
      const rawResult = resolveSwingChart(state, roll)
      const before = {
        inning: state.inning, half: state.half, outs: state.outs,
        score: structuredClone(state.score), bases: structuredClone(state.bases),
        batter: batter?.playerName ?? null, pitcher: pitcher?.playerName ?? null,
        advantage: state.plateAppearance.advantage,
      }
      const next = resolveSwingRoll(state, roll)
      const saved = await saveGameplayLabState({
        gameId: game.id,
        expectedStateVersion: game.state_version,
        nextState: next,
        eventType: 'SWING_RESOLVED',
        eventPayload: {
          ...before, swingRoll: roll, chartResult: rawResult,
          resultingOuts: next.outs, resultingScore: next.score, resultingBases: next.bases,
          pendingDecision: next.pendingDecision?.decisionType ?? null,
          nextInning: next.inning, nextHalf: next.half, gameStatus: next.status,
        },
      })
      setGame(saved)
      setEvents(await loadGameplayLabEvents(game.id))
      setSuccess(next.pendingDecision
        ? `${rawResult} persisted. Elements decision required: ${next.pendingDecision.decisionType}.`
        : `${rawResult} resolved and persisted. ${next.status === 'complete' ? 'Game complete.' : 'Next plate appearance is ready.'}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resolve the swing.')
    } finally { setSaving(false) }
  }

  function toggleDecisionSelection(id: string, single: boolean) {
    setDecisionSelection((current) => single
      ? [id]
      : current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }


  async function confirmDecision() {
    if (!game || !state) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const priorType = state.pendingDecision?.decisionType ?? 'UNKNOWN'
      const next = confirmManagerDecision(state, decisionSelection)
      next.stateVersion = state.stateVersion + 1
      next.updatedAt = new Date().toISOString()
      const saved = await saveGameplayLabState({
        gameId: game.id,
        expectedStateVersion: game.state_version,
        nextState: next,
        eventType:'DECISION_RESOLVED',
        eventPayload:{
          decisionType:priorType,
          selected:decisionSelection,
          nextDecision:next.pendingDecision?.decisionType ?? null,
          locked:true,
        },
      })
      setGame(saved); setEvents(await loadGameplayLabEvents(game.id))
      setDecisionSelection([])
      setSuccess(next.pendingDecision
        ? `Decision confirmed and locked. Next: ${next.pendingDecision.decisionType.replaceAll('_',' ')}.`
        : 'Decision confirmed and locked. Core game loop continued.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm the manager decision.')
    } finally { setSaving(false) }
  }

  async function resolvePendingRuleForTest() {
    if (!game || !state || !state.pendingDecision) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const priorType = state.pendingDecision.decisionType
      const next = resolveForDevelopmentHarness(state)
      next.stateVersion = state.stateVersion + 1
      next.updatedAt = new Date().toISOString()
      const saved = await saveGameplayLabState({
        gameId: game.id,
        expectedStateVersion: game.state_version,
        nextState: next,
        eventType: 'DECISION_RESOLVED',
        eventPayload: {
          decisionType: priorType,
          resolutionKind: 'DEVELOPMENT_TEST_BYPASS',
          developmentOnly: true,
          nextDecision: next.pendingDecision?.decisionType ?? null,
        },
      })
      setGame(saved)
      setEvents(await loadGameplayLabEvents(game.id))
      setDecisionSelection([])
      setSuccess(`Development-only test resolution applied for ${priorType.replaceAll('_',' ')}. Continue testing this same game.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply the development-only test resolution.')
    } finally {
      setSaving(false)
    }
  }

  async function rollDecisionResolver() {
    if (!game || !state) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const priorType = state.pendingDecision?.decisionType ?? 'UNKNOWN'
      const roll = rollD20()
      const next = resolveDecisionRoll(state, roll)
      next.stateVersion = state.stateVersion + 1
      next.updatedAt = new Date().toISOString()
      const saved = await saveGameplayLabState({
        gameId: game.id, expectedStateVersion: game.state_version, nextState: next,
        eventType: 'DECISION_RESOLVED',
        eventPayload: { decisionType: priorType, resolutionKind: 'ROLL', roll, nextDecision: next.pendingDecision?.decisionType ?? null },
      })
      setGame(saved); setEvents(await loadGameplayLabEvents(game.id))
      setDecisionSelection([])
      setSuccess(`d20 ${roll} resolved for ${priorType.replaceAll('_',' ')}.${next.pendingDecision ? ` Next: ${next.pendingDecision.decisionType.replaceAll('_',' ')}.` : ''}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not resolve the Rulebook roll.') }
    finally { setSaving(false) }
  }

  function runHarness() {
    if (!state || harnessRunning) return
    setError('')
    setHarness(null)
    setHarnessError('')
    setHarnessRunning(true)

    // Yield once so the button visibly changes to Running before the synchronous
    // local stress test begins. This also makes failures visible in this panel
    // instead of only at the top of a long page.
    window.setTimeout(() => {
      try {
        const report = runCoreGameHarness(state, 1925, 500)
        setHarness(report)
        if (!report.completed || report.invalidStates.length > 0) {
          setHarnessError(report.invalidStates[0] ?? 'Validation did not reach a completed game.')
        }
      } catch (e) {
        setHarnessError(e instanceof Error ? e.message : 'Developer validation harness failed.')
      } finally {
        setHarnessRunning(false)
      }
    }, 0)
  }


  function runDecisionStress() {
    if (!state || decisionStressRunning) return
    setDecisionStress(null)
    setDecisionStressError('')
    setDecisionStressRunning(true)
    window.setTimeout(() => {
      try {
        const report = runDecisionStressHarness(state, 1925, decisionStressSimulations, 500)
        setDecisionStress(report)
        if (report.failed > 0) setDecisionStressError(report.invalidStates[0] ?? `${report.failed} simulation(s) failed.`)
      } catch (e) {
        setDecisionStressError(e instanceof Error ? e.message : 'Decision stress test failed.')
      } finally {
        setDecisionStressRunning(false)
      }
    }, 0)
  }


  function runScenarioMatrix() {
    if (!state || scenarioRunning) return
    setScenarioReport(null)
    setScenarioError('')
    setScenarioRunning(true)
    window.setTimeout(() => {
      try {
        const report = runNonGbScenarioMatrix(state)
        setScenarioReport(report)
        if (report.failed > 0) {
          const first = report.results.find((item) => !item.passed)
          setScenarioError(first ? `${first.id}: ${first.detail}` : `${report.failed} scenario(s) failed.`)
        }
      } catch (e) {
        setScenarioError(e instanceof Error ? e.message : 'Scenario matrix failed.')
      } finally {
        setScenarioRunning(false)
      }
    }, 0)
  }


  function runGbScenarioMatrix() {
    if (!state || gbScenarioRunning) return
    setGbScenarioReport(null); setGbScenarioError(''); setGbScenarioRunning(true)
    window.setTimeout(() => {
      try {
        const report = runGroundBallScenarioMatrix(state)
        setGbScenarioReport(report)
        if (report.failed > 0) { const first=report.results.find((item)=>!item.passed); setGbScenarioError(first?`${first.id}: ${first.detail}`:`${report.failed} scenario(s) failed.`) }
      } catch (e) { setGbScenarioError(e instanceof Error ? e.message : 'Ground-ball scenario matrix failed.') }
      finally { setGbScenarioRunning(false) }
    },0)
  }

  function runFatigueScenarioMatrixUi() {
    if (fatigueScenarioRunning) return
    setFatigueScenarioReport(null); setFatigueScenarioError(''); setFatigueScenarioRunning(true)
    window.setTimeout(() => {
      try {
        const report = runFatigueScenarioMatrix()
        setFatigueScenarioReport(report)
        if (report.failed > 0) { const first=report.results.find((item)=>!item.passed); setFatigueScenarioError(first?`${first.id}: ${first.detail}`:`${report.failed} scenario(s) failed.`) }
      } catch (e) { setFatigueScenarioError(e instanceof Error ? e.message : 'Fatigue scenario matrix failed.') }
      finally { setFatigueScenarioRunning(false) }
    },0)
  }

  function runBoundaryScenarioMatrixUi() {
    if (boundaryScenarioRunning) return
    setBoundaryScenarioReport(null); setBoundaryScenarioError(''); setBoundaryScenarioRunning(true)
    window.setTimeout(() => {
      try {
        const report = runGameBoundaryScenarioMatrix()
        setBoundaryScenarioReport(report)
        if (report.failed > 0) { const first=report.results.find((item)=>!item.passed); setBoundaryScenarioError(first?`${first.id}: ${first.detail}`:`${report.failed} scenario(s) failed.`) }
      } catch (e) { setBoundaryScenarioError(e instanceof Error ? e.message : 'Game-boundary scenario matrix failed.') }
      finally { setBoundaryScenarioRunning(false) }
    },0)
  }

  async function togglePause() {
    if (!game || !state || !user) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const next = state.status === 'paused' ? resumeGame(state) : pauseGame(state, user.id)
      const saved = await saveGameplayLabState({
        gameId: game.id,
        expectedStateVersion: game.state_version,
        nextState: next,
        eventType: state.status === 'paused' ? 'GAME_RESUMED' : 'GAME_PAUSED',
        eventPayload: { from: state.status, to: next.status },
      })
      setGame(saved)
      setSuccess(next.status === 'paused'
        ? 'Game paused. You can refresh, close the browser, or return later.'
        : 'Game resumed at the exact saved baseball state.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update pause state.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <main className="gameplay-lab-page"><section className="gameplay-lab-panel">Loading game state…</section></main>
  if (!game || !state) return <main className="gameplay-lab-page"><section className="gameplay-lab-panel"><h1>Game unavailable</h1><p>{error || 'Game state not found.'}</p></section></main>

  const canInitialize = state.status === 'pregame' && state.pregame.home.locked
  const initialized = ['in_progress','paused','awaiting_decision','inning_transition','complete'].includes(state.status)
  const nextActor = state.nextActor ? `${sideLabel(state.nextActor)} · ${state.managers[state.nextActor].managerName}` : '—'

  return (
    <main className="gameplay-lab-page gameplay-state-page">
      <section className="gameplay-lab-hero">
        <div>
          <span>Private Development · Build 1</span>
          <h1>Playable Core Game Prototype</h1>
          <p>{state.managers.away.managerName} at {state.managers.home.managerName} · {state.configuration.seasonLabel} · {state.configuration.blueprintLabel}</p>
        </div>
        <div className={`pregame-lock-state ${initialized ? 'locked' : ''}`}>
          <small>Lifecycle</small>
          <strong>{state.status.replaceAll('_',' ').toUpperCase()}</strong>
          <span>State v{game.state_version}</span>
        </div>
      </section>

      <div className="gameplay-lab-message gameplay-fixture-note">
        <strong>Private test fixture:</strong> opponent access is still disabled. To test the real engine now, Phase 1D temporarily mirrors your already-validated locked baseball setup onto the opponent side. This is development-only and is not the future multiplayer behavior.
      </div>
      {error && <div className="gameplay-lab-message error">{error}</div>}
      {success && <div className="gameplay-lab-message success">{success}</div>}

      {canInitialize && (
        <section className="gameplay-lab-panel gameplay-initialize-panel">
          <header><div><span>Phase 1D Checkpoint</span><h2>Initialize Top 1st</h2></div><em>No rolls will occur yet.</em></header>
          <p>Your pregame is locked and valid. This will create the first live baseball state: Top 1st, 0 outs, 0–0, bases empty, leadoff hitter vs. home SP, awaiting the pitch roll.</p>
          <button className="gameplay-lab-create-button" disabled={saving} onClick={() => void initialize()}>{saving ? 'Initializing…' : 'Initialize Private Test Game'}</button>
        </section>
      )}

      {initialized && (
        <>
          <section className="gameplay-lab-panel gameplay-state-score">
            <div><small>INNING</small><strong>{state.half === 'top' ? '▲' : '▼'} {state.inning}</strong></div>
            <div><small>OUTS</small><strong>{state.outs}</strong></div>
            <div><small>SCORE</small><strong>{state.score.away} – {state.score.home}</strong><span>{state.managers.away.managerName} / {state.managers.home.managerName}</span></div>
            <div className="gameplay-bases-score-cell"><small>BASES</small><BaseDiamond bases={state.bases} /></div>
          </section>

          <section className="gameplay-lab-panel">
            <header><div><span>Current Matchup</span><h2>{batter?.playerName ?? '—'} vs. {pitcher?.playerName ?? '—'}</h2></div><em>This is engine verification, not the final game-screen design.</em></header>
            <div className="gameplay-state-matchup">
              <div><small>BATTER · {offense.toUpperCase()} #{(state.lineupCursor?.[offense] ?? 0) + 1}</small><strong>{batter?.playerName ?? '—'}</strong><span>OB {batter?.hitter.onBase ?? '—'} · BSR {batter?.hitter.baserunning ?? '—'} · SB {batter?.hitter.stolenBase ?? '—'}</span></div>
              <div className="gameplay-state-waiting"><small>WAITING FOR</small><strong>{state.waitingFor?.replaceAll('_',' ') ?? '—'}</strong><span>Next actor: {nextActor}</span></div>
              <div><small>{defense.toUpperCase()} PITCHER</small><strong>{pitcher?.playerName ?? '—'}</strong><span>Control {pitcher?.pitcher.control ?? '—'} · IP {pitcher?.pitcher.ip ?? '—'}</span></div>
            </div>
          </section>

          <section className="gameplay-lab-panel gameplay-pitch-test">
            <header>
              <div><span>Core Plate Appearance</span><h2>Playable Core Game Prototype</h2></div>
              <em>Pitch and swing rolls are authoritative and persisted.</em>
            </header>
            {state.waitingFor === 'PITCH_ROLL' ? (
              <div className="gameplay-pitch-action">
                <p>Defense rolls d20 + pitcher Control. Greater than hitter On Base = pitcher chart; less = hitter chart; equal = platoon advantage.</p>
                {getPrePitchActions(state).length > 0 && (
                  <div className="gameplay-prepitch-actions">
                    <small>MANAGER ACTIONS BEFORE THE PITCH</small>
                    <div className="gameplay-decision-options">
                      {getPrePitchActions(state).map((action) => (
                        <button type="button" key={action.id} className="gameplay-decision-option" disabled={saving} onClick={() => void beginManagerAction(action.id)}>
                          <strong>{action.label}</strong><span>{action.detail}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button className="gameplay-lab-create-button" disabled={saving || state.status === 'paused'} onClick={() => void rollPitch()}>
                  {saving ? 'Rolling…' : 'Roll Pitch'}
                </button>
              </div>
            ) : state.plateAppearance.pitchRoll !== null ? (
              <div className="gameplay-pitch-result">
                <div><small>D20</small><strong>{state.plateAppearance.pitchRoll}</strong></div>
                <div><small>PITCH TOTAL</small><strong>{state.plateAppearance.pitchTotal}</strong><span>{state.plateAppearance.pitchRoll} + {((state.pregame[defense].defaultPitcherCardKeys?.includes(state.plateAppearance.pitcherCardKey ?? '') ?? false) || pitcher?.pitcher.control == null) ? -5 : (pitcher?.pitcher.control ?? -5)} Control</span></div>
                <div><small>HITTER OB</small><strong>{state.pregame[offense].defaultBatterCardKeys.includes(state.plateAppearance.batterCardKey ?? '') || batter?.hitter.onBase == null ? 5 : (batter?.hitter.onBase ?? 5)}</strong></div>
                <div className="gameplay-pitch-advantage"><small>ADVANTAGE</small><strong>{state.plateAppearance.advantage?.toUpperCase()}</strong><span>Next: Swing Roll</span></div>
              </div>
            ) : null}
          </section>

          {state.waitingFor === 'SWING_ROLL' && (
            <section className="gameplay-lab-panel gameplay-pitch-test">
              <header><div><span>Offense Action</span><h2>Roll Swing</h2></div><em>{state.plateAppearance.advantage?.toUpperCase()} chart selected</em></header>
              <div className="gameplay-pitch-action">
                <p>The app will roll d20, read the frozen {state.plateAppearance.advantage} chart, resolve automatic baseball state where the Rulebook permits it, and stop if an Elements manager decision is required.</p>
                <button className="gameplay-lab-create-button" disabled={saving || state.status === 'paused'} onClick={() => void rollSwing()}>{saving ? 'Rolling…' : 'Roll Swing'}</button>
              </div>
            </section>
          )}

          {state.pendingDecision && (() => {
            const view = getDecisionView(state)
            if (!view) return null
            const single = view.mode === 'single'
            return (
              <section className="gameplay-lab-panel gameplay-decision-gateway">
                <header><div><span>Build 2 · Manager Decision</span><h2>{view.title}</h2></div><em>Acting side: {view.actingSide.toUpperCase()}</em></header>
                <p>{view.description}</p>
                {view.mode === 'roll' ? (
                  <button type="button" className="gameplay-lab-create-button" disabled={saving} onClick={() => void rollDecisionResolver()}>{saving ? 'Rolling…' : view.confirmationLabel}</button>
                ) : view.mode === 'information' ? (
                  <div className="gameplay-dev-bypass">
                    <strong>{view.confirmationLabel}</strong>
                    <p>This Rulebook branch is not implemented yet. Use the development-only resolver to continue this same manual test game without pretending this is the final manager-facing resolution.</p>
                    <button type="button" className="gameplay-lab-secondary-button" disabled={saving} onClick={() => void resolvePendingRuleForTest()}>
                      {saving ? 'Resolving…' : 'Resolve Pending Rule for Test'}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="gameplay-decision-options">
                      {view.options.map((option) => {
                        const selected = decisionSelection.includes(option.id)
                        return <button type="button" key={option.id} className={`gameplay-decision-option ${selected ? 'selected' : ''}`} disabled={saving} onClick={() => toggleDecisionSelection(option.id, single)}>
                          <strong>{option.label}</strong><span>{option.detail}</span>
                        </button>
                      })}
                    </div>
                    <button type="button" className="gameplay-lab-create-button" disabled={saving || decisionSelection.length === 0} onClick={() => void confirmDecision()}>{saving ? 'Confirming…' : view.confirmationLabel}</button>
                  </>
                )}
              </section>
            )
          })()}

          <section className="gameplay-lab-panel">
            <header><div><span>Private Developer Validation</span><h2>Seed 1925 Core-Game Stress Test</h2></div><em>Local clone only · never writes to the game</em></header>
            <div className="gameplay-pitch-action">
              <p>This hidden lab tool auto-declines optional extra bases/tag-ups and uses explicit temporary policies for Build-2 branches. It exists only to stress innings, scoring, runners, lineup cycling and extra innings.</p>
              <button type="button" className="gameplay-lab-secondary-button gameplay-harness-button" disabled={harnessRunning} onClick={runHarness}>{harnessRunning ? 'Running Validation…' : 'Run Core Game Validation'}</button>
            </div>
            {harnessError && <div className="gameplay-harness-inline-error"><strong>Validation stopped:</strong> {harnessError}</div>}
            {harness && <div className="gameplay-harness-report">
              <div className="gameplay-state-debug-grid">
                <span>Completed <b>{harness.completed ? 'YES' : 'NO'}</b></span>
                <span>Final <b>{harness.score.away}-{harness.score.home}</b></span>
                <span>Inning <b>{harness.finalInning} {harness.finalHalf}</b></span>
                <span>PA <b>{harness.plateAppearances}</b></span>
                <span>Invalid states <b>{harness.invalidStates.length}</b></span>
                <span>Invariant checks <b>{harness.invariants.filter((item) => item.passed).length}/{harness.invariants.length}</b></span>
              </div>
              <div className="gameplay-invariant-grid">
                {harness.invariants.map((item) => (
                  <div key={item.name} className={`gameplay-invariant ${item.passed ? 'pass' : 'fail'}`}>
                    <strong>{item.passed ? 'PASS' : 'FAIL'} · {item.name}</strong>
                    <span>{item.detail}</span>
                  </div>
                ))}
              </div>
              {harness.invalidStates.length > 0 && <pre>{harness.invalidStates.join('\n')}</pre>}
              <div className="gameplay-harness-log">{harness.log.map((line,i)=><div key={i}>{line}</div>)}</div>
            </div>}
          </section>

          <section className="gameplay-lab-panel">
            <header><div><span>Update 1 · Rulebook Validation</span><h2>Non-GB Deterministic Scenario Matrix</h2></div><em>Forced states + forced rolls · production resolvers</em></header>
            <div className="gameplay-pitch-action">
              <p>This developer-only suite deliberately creates Rulebook situations instead of waiting for random games to encounter them. It validates natural 1/20 overrides, exact thresholds, hit-advancement BsR modifiers, two-out bonuses, tag-up isolation, legal/illegal manager actions, extra bases, steals, 1B+, bunts, squeeze, intentional walks, INF IN declarations and OF rotation.</p>
              <button type="button" className="gameplay-lab-secondary-button gameplay-harness-button" disabled={scenarioRunning} onClick={runScenarioMatrix}>{scenarioRunning ? 'Running Scenario Matrix…' : 'Run Non-GB Scenario Matrix'}</button>
            </div>
            {scenarioError && <div className="gameplay-harness-inline-error"><strong>Scenario failure:</strong> {scenarioError}</div>}
            {scenarioReport && <div className="gameplay-harness-report">
              <div className="gameplay-state-debug-grid">
                <span>Scenarios <b>{scenarioReport.total}</b></span>
                <span>Passed <b>{scenarioReport.passed}</b></span>
                <span>Failed <b>{scenarioReport.failed}</b></span>
                <span>Categories <b>{Object.keys(scenarioReport.categories).length}</b></span>
              </div>
              <div className="gameplay-invariant-grid">
                {Object.entries(scenarioReport.categories).map(([name,summary]) => (
                  <div key={name} className={`gameplay-invariant ${summary.passed===summary.total?'pass':'fail'}`}><strong>{summary.passed===summary.total?'PASS':'FAIL'} · {name}</strong><span>{summary.passed}/{summary.total} deterministic scenarios</span></div>
                ))}
              </div>
              {scenarioReport.failed > 0 && <pre>{scenarioReport.results.filter((item)=>!item.passed).map((item)=>`${item.id} · ${item.description}: ${item.detail}`).join('\n')}</pre>}
              <div className="gameplay-harness-log">{scenarioReport.results.map((item)=><div key={item.id}><b>{item.passed?'PASS':'FAIL'} · {item.id}</b> — {item.description}</div>)}</div>
            </div>}
          </section>


          <section className="gameplay-lab-panel">
            <header><div><span>Update 2 · Rulebook Validation</span><h2>Ground Ball / Force / DBP Deterministic Matrix</h2></div><em>Forced states + forced rolls · Rulebook GB resolver</em></header>
            <div className="gameplay-pitch-action">
              <p>Forces GB base/out states, automatic-out RFO boundaries, standard double plays, 3B-to-1B double plays, triple-play eligibility, natural 1/20 overrides, equality-safe checks, INF IN, contact play, and illegal-action suppression.</p>
              <button type="button" className="gameplay-lab-secondary-button gameplay-harness-button" disabled={gbScenarioRunning} onClick={runGbScenarioMatrix}>{gbScenarioRunning ? 'Running GB Matrix…' : 'Run GB / Force / DBP Scenario Matrix'}</button>
            </div>
            {gbScenarioError && <div className="gameplay-harness-inline-error"><strong>GB scenario failure:</strong> {gbScenarioError}</div>}
            {gbScenarioReport && <div className="gameplay-harness-report">
              <div className="gameplay-state-debug-grid"><span>Scenarios <b>{gbScenarioReport.total}</b></span><span>Passed <b>{gbScenarioReport.passed}</b></span><span>Failed <b>{gbScenarioReport.failed}</b></span><span>Categories <b>{Object.keys(gbScenarioReport.categories).length}</b></span></div>
              <div className="gameplay-invariant-grid">{Object.entries(gbScenarioReport.categories).map(([name,summary])=><div key={name} className={`gameplay-invariant ${summary.passed===summary.total?'pass':'fail'}`}><strong>{summary.passed===summary.total?'PASS':'FAIL'} · {name}</strong><span>{summary.passed}/{summary.total} deterministic scenarios</span></div>)}</div>
              {gbScenarioReport.failed>0 && <pre>{gbScenarioReport.results.filter((item)=>!item.passed).map((item)=>`${item.id} · ${item.description}: ${item.detail}`).join('\n')}</pre>}
              <div className="gameplay-harness-log">{gbScenarioReport.results.map((item)=><div key={item.id}><b>{item.passed?'PASS':'FAIL'} · {item.id}</b> — {item.description}</div>)}</div>
            </div>}
          </section>

          <section className="gameplay-lab-panel">
            <header><div><span>Update 3 · Rulebook Validation</span><h2>Fatigue / Pitching Deterministic Matrix</h2></div><em>Forced fatigue states · production fatigue resolver</em></header>
            <div className="gameplay-pitch-action">
              <p>Forces hitter and pitcher pre-game fatigue, default-attribute immunity, IP boundaries, distance fatigue, Shutout Bonus, earned-run performance penalties, Control/On Base floors, relief distance rest, efficiency bonus, negative-Control exit penalty, and stacked fatigue effects.</p>
              <button type="button" className="gameplay-lab-secondary-button gameplay-harness-button" disabled={fatigueScenarioRunning} onClick={runFatigueScenarioMatrixUi}>{fatigueScenarioRunning ? 'Running Fatigue Matrix…' : 'Run Fatigue / Pitching Scenario Matrix'}</button>
            </div>
            {fatigueScenarioError && <div className="gameplay-harness-inline-error"><strong>Fatigue scenario failure:</strong> {fatigueScenarioError}</div>}
            {fatigueScenarioReport && <div className="gameplay-harness-report">
              <div className="gameplay-state-debug-grid"><span>Scenarios <b>{fatigueScenarioReport.total}</b></span><span>Passed <b>{fatigueScenarioReport.passed}</b></span><span>Failed <b>{fatigueScenarioReport.failed}</b></span><span>Categories <b>{Object.keys(fatigueScenarioReport.categories).length}</b></span></div>
              <div className="gameplay-invariant-grid">{Object.entries(fatigueScenarioReport.categories).map(([name,summary])=><div key={name} className={`gameplay-invariant ${summary.passed===summary.total?'pass':'fail'}`}><strong>{summary.passed===summary.total?'PASS':'FAIL'} · {name}</strong><span>{summary.passed}/{summary.total} deterministic scenarios</span></div>)}</div>
              {fatigueScenarioReport.failed>0 && <pre>{fatigueScenarioReport.results.filter((item)=>!item.passed).map((item)=>`${item.id} · ${item.description}: ${item.detail}`).join('\n')}</pre>}
              <div className="gameplay-harness-log">{fatigueScenarioReport.results.map((item)=><div key={item.id}><b>{item.passed?'PASS':'FAIL'} · {item.id}</b> — {item.description}</div>)}</div>
            </div>}
          </section>


          <section className="gameplay-lab-panel">
            <header><div><span>Update 4 · Integration Validation</span><h2>Game / Inning / Scoring / Season + Regression Matrix</h2></div><em>Boundary states + multi-mechanic regression</em></header>
            <div className="gameplay-pitch-action">
              <p>Forces inning transitions, regulation endings, walk-offs, third-out run-counting rules, 1925/2020/2023 season boundaries, and cross-checks previously certified advancement, fielding, GB and fatigue calculations.</p>
              <button type="button" className="gameplay-lab-secondary-button gameplay-harness-button" disabled={boundaryScenarioRunning} onClick={runBoundaryScenarioMatrixUi}>{boundaryScenarioRunning ? 'Running Integration Matrix…' : 'Run Game / Season / Regression Matrix'}</button>
            </div>
            {boundaryScenarioError && <div className="gameplay-harness-inline-error"><strong>Integration scenario failure:</strong> {boundaryScenarioError}</div>}
            {boundaryScenarioReport && <div className="gameplay-harness-report">
              <div className="gameplay-state-debug-grid"><span>Scenarios <b>{boundaryScenarioReport.total}</b></span><span>Passed <b>{boundaryScenarioReport.passed}</b></span><span>Failed <b>{boundaryScenarioReport.failed}</b></span><span>Categories <b>{Object.keys(boundaryScenarioReport.categories).length}</b></span></div>
              <div className="gameplay-invariant-grid">{Object.entries(boundaryScenarioReport.categories).map(([name,summary])=><div key={name} className={`gameplay-invariant ${summary.passed===summary.total?'pass':'fail'}`}><strong>{summary.passed===summary.total?'PASS':'FAIL'} · {name}</strong><span>{summary.passed}/{summary.total} deterministic scenarios</span></div>)}</div>
              {boundaryScenarioReport.failed>0 && <pre>{boundaryScenarioReport.results.filter((item)=>!item.passed).map((item)=>`${item.id} · ${item.description}: ${item.detail}`).join('\n')}</pre>}
              <div className="gameplay-harness-log">{boundaryScenarioReport.results.map((item)=><div key={item.id}><b>{item.passed?'PASS':'FAIL'} · {item.id}</b> — {item.description}</div>)}</div>
            </div>}
          </section>

          <section className="gameplay-lab-panel">
            <header><div><span>Private Developer Validation</span><h2>Rules Bot · Complete-Game Certification</h2></div><em>Seeded local clones · never writes to Supabase</em></header>
            <div className="gameplay-pitch-action">
              <p>This development-only certification bot uses the real legal-choice, Confirm and roll resolvers. No unfinished Rulebook bypass is permitted: any unsupported decision fails the simulation and reports its deterministic seed.</p>
              <div className="gameplay-stress-size-controls" role="group" aria-label="Decision stress test size">
                {([100,1000,5000] as const).map((count) => <button key={count} type="button" className={`gameplay-lab-secondary-button ${decisionStressSimulations===count?'active':''}`} disabled={decisionStressRunning} onClick={()=>setDecisionStressSimulations(count)}>{count.toLocaleString()}</button>)}
              </div>
              <button type="button" className="gameplay-lab-secondary-button gameplay-harness-button" disabled={decisionStressRunning} onClick={runDecisionStress}>{decisionStressRunning ? `Running ${decisionStressSimulations.toLocaleString()} Games…` : `Run ${decisionStressSimulations.toLocaleString()} Certification Games`}</button>
            </div>
            {decisionStressError && <div className="gameplay-harness-inline-error"><strong>Rules Bot report:</strong> {decisionStressError}</div>}
            {decisionStress && <div className="gameplay-harness-report">
              <div className="gameplay-state-debug-grid">
                <span>Games <b>{decisionStress.simulations}</b></span>
                <span>Completed <b>{decisionStress.completed}</b></span>
                <span>Failed <b>{decisionStress.failed}</b></span>
                <span>Total PA <b>{decisionStress.totalPlateAppearances}</b></span>
                <span>Decision types <b>{Object.keys(decisionStress.decisionCounts).length}</b></span>
                <span>Unique errors <b>{decisionStress.invalidStates.length}</b></span>
              </div>
              <div className="gameplay-invariant-grid">
                {Object.entries(decisionStress.decisionCounts).sort((a,b)=>b[1]-a[1]).map(([type,count]) => (
                  <div key={type} className="gameplay-invariant pass"><strong>{type}</strong><span>{count} encounter(s){decisionStress.bypassCounts[type] ? ` · ${decisionStress.bypassCounts[type]} unfinished bypass(es)` : ''}</span></div>
                ))}
              </div>
              {decisionStress.invalidStates.length > 0 && <pre>{decisionStress.invalidStates.join('\n')}</pre>}
              <div className="gameplay-harness-log">{decisionStress.sampleLogs.map((line,i)=><div key={i}>{line}</div>)}</div>
            </div>}
          </section>

          <section className="gameplay-lab-panel">
            <header><div><span>Persisted Game Events</span><h2>Game Log Audit</h2></div><em>{events.length} saved events</em></header>
            <div className="gameplay-harness-log">{events.slice().reverse().map((event)=><div key={`${event.state_version}-${event.event_type}`}><b>v{event.state_version} · {event.event_type}</b> — {JSON.stringify(event.payload)}</div>)}</div>
          </section>

          <section className="gameplay-lab-panel gameplay-state-debug">
            <header><div><span>Resume Contract</span><h2>Everything required to continue</h2></div><em>Refresh/close/reopen must not change these values.</em></header>
            <div className="gameplay-state-debug-grid">
              <span>Half <b>{state.half}</b></span>
              <span>Inning <b>{state.inning}</b></span>
              <span>Outs <b>{state.outs}</b></span>
              <span>Away cursor <b>{state.lineupCursor?.away ?? 0}</b></span>
              <span>Home cursor <b>{state.lineupCursor?.home ?? 0}</b></span>
              <span>Waiting <b>{state.waitingFor ?? '—'}</b></span>
              <span>Next actor <b>{state.nextActor ?? '—'}</b></span>
              <span>Pending decision <b>{state.pendingDecision ? state.pendingDecision.decisionType : 'none'}</b></span>
            </div>
          </section>

          <div className="pregame-actions">
            <button className="gameplay-lab-secondary-button" onClick={() => navigate('/games/lab')}>Back to Lab</button>
            <button className="gameplay-lab-secondary-button" onClick={() => navigate(`/games/lab/${game.id}/play`)}>Open Playable Shell</button>
            <button className="gameplay-lab-secondary-button" disabled={saving} onClick={() => void reload()}>Reload Saved State</button>
            <button className="gameplay-lab-create-button" disabled={saving || state.status === 'complete'} onClick={() => void togglePause()}>{saving ? 'Saving…' : state.status === 'paused' ? 'Resume Exact State' : 'Pause Game'}</button>
          </div>
        </>
      )}

      {!canInitialize && !initialized && (
        <section className="gameplay-lab-panel">
          <h2>Not ready to initialize</h2>
          <p>Return to Pregame and lock your validated setup first.</p>
          <button className="gameplay-lab-secondary-button" onClick={() => navigate(`/games/lab/${game.id}/pregame`)}>Open Pregame</button>
        </section>
      )}
    </main>
  )
}
