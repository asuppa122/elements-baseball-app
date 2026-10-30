import { CardZoomProvider, ZoomButton } from '../gameplay/presentation/CardZoom'
import { throwsLabel } from '../gameplay/presentation/handedness'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getCardImageUrl, handleCardImageLoadError } from '../utils/cardHelpers'
import { attachPregameRoster, attachRestState, lockPregame, setPregameSelections, startGame } from '../gameplay/engine'
import { canAssignDefensivePosition, getFieldingRating } from '../gameplay/defense'
import { pregameEffectiveControl, pregameEffectiveOnBase } from '../gameplay/pregameFatigueDisplay'
import {
  hasGameplayLabAccess,
  loadGameplayLabGame,
  loadGameplayLabGameVersion,
  loadPlayerRestState,
  saveGameplayLabState,
  type PersistedGameplayLabGame,
} from '../gameplay/gameRepository'
import { loadLineupChoices, rosterIssueSummary, snapshotFor, type LineupChoice } from '../gameplay/lineupChoice'
import type { DefensivePosition, GameCardSnapshot, GameRosterSnapshot, GameSide, GameState } from '../gameplay/types'

const SECTION_PREFIXES = {
  fielding: ['defense-'],
  lineup: ['lineup-'],
  bench: ['bench-'],
  rotation: ['rotation-'],
  bullpen: ['bullpen-'],
} as const

function assignmentCards(
  roster: GameRosterSnapshot,
  prefixes: readonly string[],
): Array<{ slotId: string; card: GameCardSnapshot }> {
  return Object.entries(roster.assignments)
    .filter(([slotId, cardKey]) => Boolean(cardKey) && prefixes.some((prefix) => slotId.startsWith(prefix)))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([slotId, cardKey]) => ({ slotId, card: roster.cards[cardKey] }))
    .filter((entry): entry is { slotId: string; card: GameCardSnapshot } => Boolean(entry.card))
}

function uniqueCards(entries: Array<{ slotId: string; card: GameCardSnapshot }>): GameCardSnapshot[] {
  const seen = new Set<string>()
  return entries.flatMap(({ card }) => {
    if (seen.has(card.cardKey)) return []
    seen.add(card.cardKey)
    return [card]
  })
}

function slotLabel(slotId: string): string {
  if (slotId.startsWith('rotation-')) return `SP${slotId.replace('rotation-', '')}`
  if (slotId.startsWith('bullpen-')) return `RP${slotId.replace('bullpen-', '')}`
  if (slotId.startsWith('bench-')) return `BN${slotId.replace('bench-', '')}`
  if (slotId.startsWith('lineup-')) return `#${slotId.replace('lineup-', '')}`
  if (slotId.startsWith('defense-')) return slotId.replace('defense-', '').toUpperCase()
  return slotId
}

function PlayerMini({ card, label }: { card: GameCardSnapshot; label?: string }) {
  return (
    <div className="pregame-player-mini">
      <div className="pregame-player-thumb">
        {card.imageUrl ? (
          <img
            src={getCardImageUrl(card.imageUrl, 'thumb') ?? card.imageUrl}
            alt=""
            referrerPolicy="no-referrer"
            onError={(event) => handleCardImageLoadError(event.currentTarget, card.imageUrl)}
          />
        ) : (
          <span>{card.playerName[0]}</span>
        )}
      </div>
      <div>
        {label && <small>{label}</small>}
        <strong>{card.playerName}</strong>
        <span>{card.year ?? '—'} · {card.points.toLocaleString()} pts</span>
      </div>
    </div>
  )
}

export default function GameplayPregamePage() {
  const { gameId = '' } = useParams()
  const navigate = useNavigate()
  const { user, isDemo } = useAuth()
  const [game, setGame] = useState<PersistedGameplayLabGame | null>(null)
  const [startingPitcher, setStartingPitcher] = useState('')
  const [defaultBatters, setDefaultBatters] = useState<string[]>([])
  const [gameBattingOrder, setGameBattingOrder] = useState<string[]>([])
  const [defensiveAlignment, setDefensiveAlignment] = useState<Partial<Record<DefensivePosition, string>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  // Which side the signed-in manager is setting up. The creator is home; in a
  // two-player game the opponent opens this same page as away.
  const [side, setSide] = useState<GameSide>('home')
  // An away manager arrives with no roster frozen yet: they pick their own.
  const [choices, setChoices] = useState<LineupChoice[] | null>(null)
  const [choiceId, setChoiceId] = useState('')
  // bumped to re-run the page's initialisation after a roster is attached
  const [loadKey, setLoadKey] = useState(0)
  const [restStateByCardKey, setRestStateByCardKey] = useState<
    Record<string, { hitterGamesRemaining: number; pitcherGamesRemaining: number }>
  >({})

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
        const loaded = await loadGameplayLabGame(gameId)
        if (cancelled) return
        const mySide: GameSide = loaded.game_state.managers.away.userId === user?.id ? 'away' : 'home'
        setSide(mySide)
        setGame(loaded)
        if (!loaded.game_state.pregame[mySide].roster) {
          const loadedChoices = await loadLineupChoices()
          if (cancelled) return
          setChoices(loadedChoices)
          setChoiceId(loadedChoices.find((c) => c.eligibility.eligible)?.lineup.id ?? loadedChoices[0]?.lineup.id ?? '')
        }
        // For display only, before any decision locks -- so a manager can see
        // whether a player is actually fatigued before choosing them, not just
        // find out mid-game. The real, authoritative fetch that actually gets
        // frozen into the game state still happens in persistSelections below.
        const rosterCardKeysForDisplay = Object.keys(loaded.game_state.pregame[mySide].roster?.cards ?? {})
        if (rosterCardKeysForDisplay.length > 0) {
          loadPlayerRestState(loaded.game_state.configuration.seasonId, rosterCardKeysForDisplay)
            .then((result) => { if (!cancelled) setRestStateByCardKey(result) })
            .catch(() => { if (!cancelled) setRestStateByCardKey({}) })
        }
        const pg = loaded.game_state.pregame[mySide]
        setStartingPitcher(pg.startingPitcherCardKey ?? '')
        setDefaultBatters(pg.defaultBatterCardKeys ?? [])
        const roster = pg.roster
        const savedOrder = pg.battingOrderCardKeys ?? []
        const initialOrder = savedOrder.length ? savedOrder : Array.from({ length: 9 }, (_, i) => roster?.assignments[`lineup-${i + 1}`]).filter((key): key is string => Boolean(key))
        setGameBattingOrder(initialOrder)
        const savedDefense = pg.defensiveAlignment ?? {}
        if (Object.keys(savedDefense).length) setDefensiveAlignment(savedDefense)
        else if (roster) {
          const d: Partial<Record<DefensivePosition, string>> = {}
          for (const pos of ['C','1B','2B','3B','SS','LF','CF','RF','DH'] as DefensivePosition[]) {
            const key = roster.assignments[`defense-${pos.toLowerCase()}`]
            if (key) d[pos] = key
          }
          if (pg.startingPitcherCardKey) d.P = pg.startingPitcherCardKey
          setDefensiveAlignment(d)
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load pregame.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [gameId, user?.id, isDemo, loadKey])

  const roster = game?.game_state.pregame[side].roster ?? null
  const rotation = useMemo(() => roster ? assignmentCards(roster, SECTION_PREFIXES.rotation) : [], [roster])
  const bullpen = useMemo(() => roster ? assignmentCards(roster, SECTION_PREFIXES.bullpen) : [], [roster])
  const fielding = useMemo(() => roster ? assignmentCards(roster, SECTION_PREFIXES.fielding) : [], [roster])
  const bench = useMemo(() => roster ? assignmentCards(roster, SECTION_PREFIXES.bench) : [], [roster])
  const battingOrder = useMemo(() => roster ? assignmentCards(roster, SECTION_PREFIXES.lineup) : [], [roster])

  const staffSlot = useMemo(() => {
    const slot = new Map<string, string>()
    for (const { slotId, card } of [...bullpen, ...rotation]) slot.set(card.cardKey, slotLabel(slotId))
    return slot
  }, [rotation, bullpen])
  // Anyone with a pitcher card may start: rotation, bullpen, or a two-way
  // player from the field or bench (Anthony, after the first live game).
  // Rotation first so the usual starters lead the list, then the bullpen,
  // then everyone else.
  const startingPitcherOptions = useMemo(
    () => uniqueCards([...rotation, ...bullpen, ...(roster ? Object.values(roster.cards).map((card) => ({ slotId: card.cardKey, card })) : [])])
      .filter((card) => card.pitcher.control !== null),
    [rotation, bullpen, roster],
  )

  const startingBatters = useMemo(() => {
    const primary = battingOrder.length > 0 ? uniqueCards(battingOrder) : uniqueCards(fielding)
    const withSelectedPitcher = startingPitcher
      ? [...primary, roster?.cards[startingPitcher]].filter((card): card is GameCardSnapshot => Boolean(card))
      : primary
    return uniqueCards(withSelectedPitcher.map((card) => ({ slotId: card.cardKey, card })))
      .filter((card) => card.hitter.onBase !== null)
  }, [battingOrder, fielding, roster, startingPitcher])

  const rosterCards = useMemo(() => roster ? Object.values(roster.cards) : [], [roster])
  const defensePositions = useMemo<DefensivePosition[]>(() => roster?.useDh
    ? ['C','1B','2B','3B','SS','LF','CF','RF','P','DH']
    : ['C','1B','2B','3B','SS','LF','CF','RF','P'], [roster])

  const myPregame = game?.game_state.pregame[side]
  const locked = Boolean(myPregame?.locked)
  const opponentSide: GameSide = side === 'home' ? 'away' : 'home'
  const twoPlayer = game?.game_state.turnHandshake === true
  const status = game?.game_state.status

  // Two managers setting up at once: poll so each sees the other lock in, and
  // the game open for both the moment either one starts it.
  const refreshGame = useCallback(async () => {
    if (!gameId) return
    try { setGame(await loadGameplayLabGame(gameId)) } catch { /* retried next tick */ }
  }, [gameId])
  useEffect(() => {
    if (!gameId || !twoPlayer || status === 'in_progress' || status === 'complete') return
    let busy = false
    const timer = window.setInterval(async () => {
      if (busy || document.visibilityState === 'hidden') return
      busy = true
      try {
        const latest = await loadGameplayLabGameVersion(gameId)
        if (game && latest > game.state_version) await refreshGame()
      } catch { /* transient */ } finally { busy = false }
    }, 2500)
    return () => window.clearInterval(timer)
  }, [gameId, twoPlayer, status, game, refreshGame])
  useEffect(() => {
    if (twoPlayer && game && (status === 'in_progress' || status === 'awaiting_decision')) navigate(`/games/lab/${game.id}/screen`)
  }, [twoPlayer, status, game, navigate])

  async function chooseTeam() {
    const choice = choices?.find((c) => c.lineup.id === choiceId)
    if (!game || !choice?.eligibility.eligible) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const fresh = await loadGameplayLabGame(game.id)
      const next = attachPregameRoster(fresh.game_state as GameState, side, snapshotFor(choice))
      await saveGameplayLabState({
        gameId: game.id, expectedStateVersion: fresh.state_version, nextState: next,
        eventType: 'PREGAME_SUBMITTED', eventPayload: { side, rosterAttached: choice.lineup.name },
      })
      // re-run the page's own initialisation against the newly frozen roster
      setChoices(null)
      setLoadKey((k) => k + 1)
    } catch (e) {
      setError(errorText(e, 'Could not attach your roster.'))
    } finally {
      setSaving(false)
    }
  }

  async function beginGame() {
    if (!game) return
    setSaving(true); setError('')
    try {
      const fresh = await loadGameplayLabGame(game.id)
      const s = fresh.game_state as GameState
      if (s.status === 'ready') {
        await saveGameplayLabState({
          gameId: game.id, expectedStateVersion: fresh.state_version, nextState: startGame(s),
          eventType: 'GAME_STARTED', eventPayload: { startedBy: side },
        })
      }
      navigate(`/games/lab/${game.id}/screen`)
    } catch (e) {
      // the other manager may have started it a moment earlier -- that is fine
      if (/stale game state/i.test(errorText(e, ''))) navigate(`/games/lab/${game.id}/screen`)
      else setError(errorText(e, 'Could not start the game.'))
    } finally {
      setSaving(false)
    }
  }

  function moveBatter(index: number, direction: -1 | 1) {
    if (locked) return
    const target = index + direction
    if (target < 0 || target >= gameBattingOrder.length) return
    setGameBattingOrder((current) => {
      const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next
    })
    setSuccess('')
  }

  function replaceBattingOrderMember(oldCardKey: string | undefined, newCardKey: string) {
    setGameBattingOrder((current) => {
      if (current.includes(newCardKey)) {
        return oldCardKey && oldCardKey !== newCardKey ? current.filter((key) => key !== oldCardKey) : current
      }
      if (oldCardKey) {
        const oldIndex = current.indexOf(oldCardKey)
        if (oldIndex >= 0) {
          const next = [...current]
          next[oldIndex] = newCardKey
          return next
        }
      }
      return current.length < 9 ? [...current, newCardKey] : current
    })
  }

  function selectStartingPitcher(cardKey: string) {
    if (locked) return
    const oldPitcher = startingPitcher || defensiveAlignment.P
    setStartingPitcher(cardKey)
    setDefensiveAlignment((current) => {
      const next: Partial<Record<DefensivePosition, string>> = { ...current, P: cardKey }
      for (const position of defensePositions) {
        if (position !== 'P' && next[position] === cardKey) delete next[position]
      }
      return next
    })
    if (!roster.useDh) replaceBattingOrderMember(oldPitcher, cardKey)
    setSuccess('')
  }

  function selectDefender(position: DefensivePosition, cardKey: string) {
    if (locked || position === 'P') return
    const oldCardKey = defensiveAlignment[position]
    setDefensiveAlignment((current) => {
      const next = { ...current }
      if (cardKey) next[position] = cardKey
      else delete next[position]
      return next
    })
    if (cardKey) replaceBattingOrderMember(oldCardKey, cardKey)
    setSuccess('')
  }

  function availableDefenders(position: DefensivePosition) {
    const currentCardKey = defensiveAlignment[position]
    const usedElsewhere = new Set(
      Object.entries(defensiveAlignment)
        .filter(([otherPosition, key]) => otherPosition !== position && Boolean(key))
        .map(([, key]) => key as string),
    )
    return rosterCards.filter((card) => canAssignDefensivePosition(card, position) && (card.cardKey === currentCardKey || !usedElsewhere.has(card.cardKey)))
  }

  function toggleDefault(cardKey: string) {
    if (locked) return
    setDefaultBatters((current) => current.includes(cardKey)
      ? current.filter((key) => key !== cardKey)
      : [...current, cardKey])
    setSuccess('')
  }

  async function persistSelections(lockAfterSave: boolean) {
    if (!game || !startingPitcher) return
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      // Re-read first: in a two-player game the other manager may have saved
      // their own pregame since this page loaded.
      const fresh = await loadGameplayLabGame(game.id)
      const currentState = fresh.game_state as GameState
      const withSelections = setPregameSelections(currentState, side, {
        startingPitcherCardKey: startingPitcher,
        defaultBatterCardKeys: defaultBatters,
        battingOrderCardKeys: gameBattingOrder,
        defensiveAlignment,
      })

      // Fetch this manager's own persistent Ftg/Rm rest rows (RLS-scoped --
      // an opponent's rows are never reachable from here) and freeze them
      // into the game state now, once, the same moment the roster itself is
      // already frozen -- an in-progress game never re-reads this live.
      const myRosterCardKeys = Object.keys(currentState.pregame[side].roster?.cards ?? {})
      const myRestState = await loadPlayerRestState(currentState.configuration.seasonId, myRosterCardKeys)
      const withRestState = attachRestState(withSelections, side, myRestState)

      let saved = await saveGameplayLabState({
        gameId: game.id,
        expectedStateVersion: fresh.state_version,
        nextState: withRestState,
        eventType: 'PREGAME_SUBMITTED',
        eventPayload: {
          startingPitcherCardKey: startingPitcher,
          defaultBatterCardKeys: defaultBatters,
          battingOrderCardKeys: gameBattingOrder,
          defensiveAlignment,
        },
      })

      if (lockAfterSave) {
        const lockedState = lockPregame(saved.game_state as GameState, side)
        saved = await saveGameplayLabState({
          gameId: game.id,
          expectedStateVersion: saved.state_version,
          nextState: lockedState,
          eventType: 'PREGAME_LOCKED',
          eventPayload: { side },
        })
      }

      setGame(saved)
      setStartingPitcher(saved.game_state.pregame[side].startingPitcherCardKey ?? '')
      setDefaultBatters(saved.game_state.pregame[side].defaultBatterCardKeys ?? [])
      setGameBattingOrder(saved.game_state.pregame[side].battingOrderCardKeys ?? [])
      setDefensiveAlignment(saved.game_state.pregame[side].defensiveAlignment ?? {})
      setSuccess(lockAfterSave
        ? (twoPlayer ? 'Your pregame is locked.' : 'Your pregame selections are locked for this test game.')
        : 'Pregame selections saved.')
    } catch (saveError) {
      setError(errorText(saveError, 'Could not save pregame selections.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main className="gameplay-lab-page"><section className="gameplay-lab-panel">Loading pregame…</section></main>
  }

  if (game && !roster && choices) {
    const choice = choices.find((c) => c.lineup.id === choiceId)
    const host = game.game_state.managers[opponentSide].managerName
    return (
      <main className="gameplay-lab-page gameplay-pregame-page">
        <section className="gameplay-lab-hero gameplay-pregame-hero">
          <div>
            <span>Pregame · You are {side}</span>
            <h1>{game.game_state.managers.home.managerName} vs. {game.game_state.managers.away.managerName}</h1>
            <p>{host} challenged you. Choose the saved roster you will play this game with; it is frozen for the whole game.</p>
          </div>
        </section>
        {error && <div className="gameplay-lab-message error">{error}</div>}
        <section className="gameplay-lab-panel">
          <header><div><span>Step 1</span><h2>Choose your team</h2></div></header>
          <div className="gameplay-lab-create-grid">
            <label>
              <span>Your Saved Roster</span>
              <select value={choiceId} onChange={(e) => setChoiceId(e.target.value)}>
                {choices.length === 0 && <option value="">No saved rosters found</option>}
                {choices.map((c) => <option key={c.lineup.id} value={c.lineup.id}>{c.lineup.name} — {c.eligibility.eligible ? 'eligible' : 'ineligible'}</option>)}
              </select>
              <small>{choice ? rosterIssueSummary(choice.eligibility.issues) : 'Build one in Team Builder first.'}</small>
            </label>
          </div>
          <div className="pregame-actions">
            <button type="button" className="gameplay-lab-secondary-button" onClick={() => navigate('/games/lab')}>Back</button>
            <button type="button" className="gameplay-lab-create-button" disabled={saving || !choice?.eligibility.eligible} onClick={() => void chooseTeam()}>
              {saving ? 'Saving…' : 'Use This Roster'}
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (!game || !roster) {
    return (
      <main className="gameplay-lab-page">
        <section className="gameplay-lab-panel">
          <span>Private Development</span>
          <h1>Pregame unavailable</h1>
          <p>{error || 'This test game does not contain a frozen home roster.'}</p>
          <button type="button" className="gameplay-lab-secondary-button" onClick={() => navigate('/games/lab')}>Back to Gameplay Lab</button>
        </section>
      </main>
    )
  }

  const opponentName = game.game_state.managers[opponentSide].managerName
  const opponentPregame = game.game_state.pregame[opponentSide]
  const opponentState = !opponentPregame.roster ? 'CHOOSING TEAM' : opponentPregame.locked ? 'LOCKED' : 'SETTING UP'

  return (
    <CardZoomProvider>
    <main className="gameplay-lab-page gameplay-pregame-page">
      <section className="gameplay-lab-hero gameplay-pregame-hero">
        <div>
          <span>Pregame · You are {side}</span>
          <h1>{game.game_state.managers.home.managerName} vs. {game.game_state.managers.away.managerName}</h1>
          <p>{game.configuration_snapshot.seasonLabel} · {game.configuration_snapshot.blueprintLabel} · Frozen roster: {roster.sourceLineupName}</p>
        </div>
        <div className={`pregame-lock-state ${locked ? 'locked' : ''}`}>
          <small>Your Pregame</small>
          <strong>{locked ? 'LOCKED' : 'EDITABLE'}</strong>
          <span>State v{game.state_version}</span>
        </div>
      </section>

      {error && <div className="gameplay-lab-message error">{error}</div>}
      {success && <div className="gameplay-lab-message success">{success}</div>}

      <section className="gameplay-lab-panel pregame-roster-summary">
        <header>
          <div><span>Frozen Snapshot</span><h2>{roster.sourceLineupName}</h2></div>
          <em>{roster.playerCount} unique players · {roster.totalPoints.toLocaleString()} / {game.configuration_snapshot.pointCap.toLocaleString()} pts · DH {roster.useDh ? 'ON' : 'OFF'}</em>
        </header>
        <div className="pregame-roster-columns">
          <div><h3>Fielding</h3>{fielding.map(({ slotId, card }) => <PlayerMini key={slotId} label={slotLabel(slotId)} card={card} />)}</div>
          <div><h3>Bench</h3>{bench.length ? bench.map(({ slotId, card }) => <PlayerMini key={slotId} label={slotLabel(slotId)} card={card} />) : <p>None</p>}</div>
          <div><h3>Rotation</h3>{rotation.map(({ slotId, card }) => <PlayerMini key={slotId} label={slotLabel(slotId)} card={card} />)}</div>
          <div><h3>Bullpen</h3>{bullpen.map(({ slotId, card }) => <PlayerMini key={slotId} label={slotLabel(slotId)} card={card} />)}</div>
        </div>
      </section>

      <section className="gameplay-lab-panel">
        <header>
          <div><span>Pregame Decision 1</span><h2>Starting Pitcher</h2></div>
          <em>Anyone with a pitcher card can start — rotation, bullpen or a two-way player. Control shown is what he will pitch with today, after rest. This choice becomes permanent when you lock pregame.</em>
        </header>
        <div className="pregame-choice-grid pitcher-grid">
          {startingPitcherOptions.map((card) => {
            const effectiveControl = pregameEffectiveControl(card, restStateByCardKey) ?? card.pitcher.control
            const rest = restStateByCardKey[card.cardKey]?.pitcherGamesRemaining ?? 0
            const tired = effectiveControl !== card.pitcher.control
            const hand = throwsLabel(card.pitcher.arm)
            const slot = staffSlot.get(card.cardKey)
            return (
              <div className="pregame-choice-wrap" key={card.cardKey}>
                <button
                  type="button"
                  disabled={locked}
                  className={`pregame-choice-card ${startingPitcher === card.cardKey ? 'selected' : ''}`}
                  onClick={() => selectStartingPitcher(card.cardKey)}
                >
                  <div className="pregame-choice-image">{card.imageUrl ? <img src={getCardImageUrl(card.imageUrl, 'grid') ?? card.imageUrl} alt={card.playerName} referrerPolicy="no-referrer" onError={(event) => handleCardImageLoadError(event.currentTarget, card.imageUrl)} /> : <span>{card.playerName[0]}</span>}</div>
                  <strong>{card.playerName}</strong>
                  <span className="pregame-pitcher-tags">{[slot, hand].filter(Boolean).join(' · ')}</span>
                  {/* Base, fatigue and effective, so the pick is made on the
                      number he will actually pitch with. */}
                  <span className={`pregame-pitcher-ctrl${tired ? ' is-tired' : ''}`}>
                    {tired
                      ? <>Base C{card.pitcher.control} · Fatigue {(effectiveControl ?? 0) - (card.pitcher.control ?? 0)} · <b>Effective C{effectiveControl}</b></>
                      : <><b>C{card.pitcher.control ?? '—'}</b> · Rested</>}
                  </span>
                  <span>IP {card.pitcher.ip ?? '—'}{rest > 0 ? ` · ${rest} game${rest === 1 ? '' : 's'} from rested` : ''}</span>
                </button>
                <ZoomButton card={card} />
              </div>
            )
          })}
        </div>
      </section>

      <section className="gameplay-lab-panel">
        <header>
          <div><span>Pregame Decision 2</span><h2>Game Lineup & Defensive Alignment</h2></div>
          <em>Derived from the frozen Team Builder roster. Reorder it for this game without changing the saved roster.</em>
        </header>
        <div className="pregame-game-lineup-grid">
          <div className="pregame-order-list">
            <h3>Batting Order</h3>
            {gameBattingOrder.map((cardKey, index) => {
              const card = roster.cards[cardKey]
              if (!card) return null
              return <div className="pregame-order-row" key={`${cardKey}-${index}`}><b>{index + 1}</b><div><strong>{card.playerName}</strong><span>{defensiveAlignment.P === cardKey ? 'P' : Object.entries(defensiveAlignment).find(([, key]) => key === cardKey)?.[0] ?? ''}</span></div><div><button disabled={locked || index === 0} onClick={() => moveBatter(index,-1)}>↑</button><button disabled={locked || index === gameBattingOrder.length - 1} onClick={() => moveBatter(index,1)}>↓</button></div></div>
            })}
          </div>
          <div className="pregame-defense-editor">
            <h3>Defense</h3>
            {defensePositions.map((position) => <label key={position}><span>{position}</span><select disabled={locked || position === 'P'} value={position === 'P' ? startingPitcher : (defensiveAlignment[position] ?? '')} onChange={(e) => selectDefender(position, e.target.value)}><option value="">Select player</option>{(position === 'P' ? startingPitcherOptions : availableDefenders(position)).map((card) => {
                  const rating = getFieldingRating(card, position)
                  return <option key={card.cardKey} value={card.cardKey}>{card.playerName}{rating !== null ? ` (${position} ${rating >= 0 ? '+' : ''}${rating})` : ''}</option>
                })}</select></label>)}
          </div>
        </div>
      </section>

      <section className="gameplay-lab-panel">
        <header>
          <div><span>Pregame Decision 3</span><h2>Default Batter Declarations</h2></div>
          <em>Game-only choice. Selected players use default hitter attributes to avoid additional fatigue effects; the saved Team Builder roster is not changed.</em>
        </header>
        <div className="pregame-default-grid">
          {startingBatters.map((card) => {
            const selected = defaultBatters.includes(card.cardKey)
            const effectiveOnBase = pregameEffectiveOnBase(card, restStateByCardKey)
            return (
              <button
                type="button"
                key={card.cardKey}
                disabled={locked}
                className={`pregame-default-player ${selected ? 'selected' : ''}`}
                onClick={() => toggleDefault(card.cardKey)}
              >
                <div className="pregame-player-thumb">{card.imageUrl ? <img src={getCardImageUrl(card.imageUrl, 'thumb') ?? card.imageUrl} alt="" referrerPolicy="no-referrer" onError={(event) => handleCardImageLoadError(event.currentTarget, card.imageUrl)} /> : <span>{card.playerName[0]}</span>}</div>
                <div>
                  <strong>{card.playerName}</strong>
                  <span>
                    {selected ? 'USE DEFAULT ATTRIBUTES' : 'Use card attributes'}
                    {effectiveOnBase !== null && !selected && (
                      <span className="pregame-fatigue-adjusted" title="Fatigue-adjusted effective On Base, carrying rest debt from prior games -- declaring default attributes below would avoid this penalty for this game">
                        {' '}· On Base {card.hitter.onBase} → {effectiveOnBase}
                      </span>
                    )}
                  </span>
                </div>
                <b>{selected ? 'DEFAULT' : 'CARD'}</b>
              </button>
            )
          })}
        </div>
      </section>

      <section className="gameplay-lab-panel pregame-opponent-pending">
        <div>
          <span>Opponent Pregame</span>
          <h2>{opponentName}</h2>
          <p>{twoPlayer
            ? (status === 'ready' ? 'Both managers are locked in. Either of you can start the game.'
              : opponentPregame.locked ? `${opponentName} is locked in.` : `${opponentName} is setting up their team. This updates on its own.`)
            : 'One-screen test game: the opponent side is filled from your roster on the Game State page.'}</p>
        </div>
        <strong>{twoPlayer ? opponentState : 'PENDING'}</strong>
      </section>

      <div className="pregame-actions">
        <button type="button" className="gameplay-lab-secondary-button" onClick={() => navigate('/games/lab')}>Back to Lab</button>
        {locked && !twoPlayer && <button type="button" className="gameplay-lab-create-button" onClick={() => navigate(`/games/lab/${game.id}/state`)}>Open Game State Test</button>}
        {twoPlayer && status === 'ready' && <button type="button" className="gameplay-lab-create-button" disabled={saving} onClick={() => void beginGame()}>{saving ? 'Starting…' : 'Start Game'}</button>}
        {!locked && <button type="button" className="gameplay-lab-secondary-button" disabled={saving || !startingPitcher} onClick={() => void persistSelections(false)}>{saving ? 'Saving…' : 'Save Selections'}</button>}
        {!locked && <button type="button" className="gameplay-lab-create-button" disabled={saving || !startingPitcher} onClick={() => void persistSelections(true)}>{saving ? 'Locking…' : 'Lock My Pregame'}</button>}
      </div>
    </main>
    </CardZoomProvider>
  )
}

function errorText(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') return (e as { message: string }).message
  return fallback
}
