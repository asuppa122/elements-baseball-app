import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getCardImageUrl, handleCardImageLoadError } from '../utils/cardHelpers'
import { attachRestState, lockPregame, setPregameSelections } from '../gameplay/engine'
import { canAssignDefensivePosition, getFieldingRating } from '../gameplay/defense'
import {
  hasGameplayLabAccess,
  loadGameplayLabGame,
  loadPlayerRestState,
  saveGameplayLabState,
  type PersistedGameplayLabGame,
} from '../gameplay/gameRepository'
import type { DefensivePosition, GameCardSnapshot, GameRosterSnapshot, GameState } from '../gameplay/types'

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
  if (slotId.startsWith('bullpen-')) return `P${slotId.replace('bullpen-', '')}`
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
        setGame(loaded)
        const pg = loaded.game_state.pregame.home
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
  }, [gameId, user?.id, isDemo])

  const roster = game?.game_state.pregame.home.roster ?? null
  const rotation = useMemo(() => roster ? assignmentCards(roster, SECTION_PREFIXES.rotation) : [], [roster])
  const bullpen = useMemo(() => roster ? assignmentCards(roster, SECTION_PREFIXES.bullpen) : [], [roster])
  const fielding = useMemo(() => roster ? assignmentCards(roster, SECTION_PREFIXES.fielding) : [], [roster])
  const bench = useMemo(() => roster ? assignmentCards(roster, SECTION_PREFIXES.bench) : [], [roster])
  const battingOrder = useMemo(() => roster ? assignmentCards(roster, SECTION_PREFIXES.lineup) : [], [roster])

  const startingPitcherOptions = useMemo(
    () => uniqueCards(rotation).filter((card) => card.pitcher.control !== null),
    [rotation],
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

  const homePregame = game?.game_state.pregame.home
  const locked = Boolean(homePregame?.locked)

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
      const currentState = game.game_state as GameState
      const withSelections = setPregameSelections(currentState, 'home', {
        startingPitcherCardKey: startingPitcher,
        defaultBatterCardKeys: defaultBatters,
        battingOrderCardKeys: gameBattingOrder,
        defensiveAlignment,
      })

      // Fetch this manager's own persistent Ftg/Rm rest rows (RLS-scoped --
      // an opponent's rows are never reachable from here) and freeze them
      // into the game state now, once, the same moment the roster itself is
      // already frozen -- an in-progress game never re-reads this live.
      const homeRosterCardKeys = Object.keys(currentState.pregame.home.roster?.cards ?? {})
      const restStateForHome = await loadPlayerRestState(currentState.configuration.seasonId, homeRosterCardKeys)
      const withRestState = attachRestState(withSelections, 'home', restStateForHome)

      let saved = await saveGameplayLabState({
        gameId: game.id,
        expectedStateVersion: game.state_version,
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
        const lockedState = lockPregame(saved.game_state as GameState, 'home')
        saved = await saveGameplayLabState({
          gameId: game.id,
          expectedStateVersion: saved.state_version,
          nextState: lockedState,
          eventType: 'PREGAME_LOCKED',
          eventPayload: { side: 'home' },
        })
      }

      setGame(saved)
      setStartingPitcher(saved.game_state.pregame.home.startingPitcherCardKey ?? '')
      setDefaultBatters(saved.game_state.pregame.home.defaultBatterCardKeys ?? [])
      setGameBattingOrder(saved.game_state.pregame.home.battingOrderCardKeys ?? [])
      setDefensiveAlignment(saved.game_state.pregame.home.defensiveAlignment ?? {})
      setSuccess(lockAfterSave
        ? 'Your pregame selections are locked for this test game. Opponent setup remains intentionally unavailable in the private lab.'
        : 'Pregame selections saved. Refresh this page to verify they persist before locking them.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save pregame selections.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main className="gameplay-lab-page"><section className="gameplay-lab-panel">Loading pregame…</section></main>
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

  const opponentName = game.game_state.managers.away.managerName

  return (
    <main className="gameplay-lab-page gameplay-pregame-page">
      <section className="gameplay-lab-hero gameplay-pregame-hero">
        <div>
          <span>Private Development · Pregame</span>
          <h1>Anthony vs. {opponentName}</h1>
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
          <em>Choose from the frozen starting rotation. This choice becomes permanent when you lock pregame.</em>
        </header>
        <div className="pregame-choice-grid pitcher-grid">
          {startingPitcherOptions.map((card) => (
            <button
              type="button"
              key={card.cardKey}
              disabled={locked}
              className={`pregame-choice-card ${startingPitcher === card.cardKey ? 'selected' : ''}`}
              onClick={() => selectStartingPitcher(card.cardKey)}
            >
              <div className="pregame-choice-image">{card.imageUrl ? <img src={getCardImageUrl(card.imageUrl, 'grid') ?? card.imageUrl} alt={card.playerName} referrerPolicy="no-referrer" onError={(event) => handleCardImageLoadError(event.currentTarget, card.imageUrl)} /> : <span>{card.playerName[0]}</span>}</div>
              <strong>{card.playerName}</strong>
              <span>Control {card.pitcher.control ?? '—'} · IP {card.pitcher.ip ?? '—'}</span>
            </button>
          ))}
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
            return (
              <button
                type="button"
                key={card.cardKey}
                disabled={locked}
                className={`pregame-default-player ${selected ? 'selected' : ''}`}
                onClick={() => toggleDefault(card.cardKey)}
              >
                <div className="pregame-player-thumb">{card.imageUrl ? <img src={getCardImageUrl(card.imageUrl, 'thumb') ?? card.imageUrl} alt="" referrerPolicy="no-referrer" onError={(event) => handleCardImageLoadError(event.currentTarget, card.imageUrl)} /> : <span>{card.playerName[0]}</span>}</div>
                <div><strong>{card.playerName}</strong><span>{selected ? 'USE DEFAULT ATTRIBUTES' : 'Use card attributes'}</span></div>
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
          <p>Opponent access remains disabled for this private development slice. Their roster and locked decisions will be added when we test the true two-manager pregame flow.</p>
        </div>
        <strong>PENDING</strong>
      </section>

      <div className="pregame-actions">
        <button type="button" className="gameplay-lab-secondary-button" onClick={() => navigate('/games/lab')}>Back to Lab</button>
        {locked && <button type="button" className="gameplay-lab-create-button" onClick={() => navigate(`/games/lab/${game.id}/state`)}>Open Game State Test</button>}
        {!locked && <button type="button" className="gameplay-lab-secondary-button" disabled={saving || !startingPitcher} onClick={() => void persistSelections(false)}>{saving ? 'Saving…' : 'Save Selections'}</button>}
        {!locked && <button type="button" className="gameplay-lab-create-button" disabled={saving || !startingPitcher} onClick={() => void persistSelections(true)}>{saving ? 'Locking…' : 'Lock My Pregame'}</button>}
      </div>
    </main>
  )
}
