import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { appPath } from '../lib/appPaths'

export type LineupRecord = {
  id: string
  name: string
  is_active: boolean
  sort_order: number
  use_dh: boolean
  player_count: number
  total_points: number
  roster_state: {
    assigned?: Record<string, string>
    rosterFormat?: 'compact' | 'full'
    useDh?: boolean
  } | null
  updated_at: string
}

const MAX_LINEUPS = 3

export default function LineupSelectorPage() {
  const navigate = useNavigate()
  const { user, isDemo } = useAuth()
  const [lineups, setLineups] = useState<LineupRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function loadLineups() {
    if (isDemo) {
      setLineups([{
        id: 'sample',
        name: '2025 Elements Demo',
        is_active: true,
        sort_order: 0,
        use_dh: true,
        player_count: 26,
        total_points: 5999,
        roster_state: { assigned: {}, rosterFormat: 'full', useDh: true },
        updated_at: new Date(0).toISOString(),
      }])
      setLoading(false)
      return
    }
    if (!user) return
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('lineups')
      .select('id, name, is_active, sort_order, use_dh, player_count, total_points, roster_state, updated_at')
      .order('sort_order')
      .order('created_at')

    if (loadError) {
      setError(loadError.message)
      setLoading(false)
      return
    }

    const rows = (data ?? []) as LineupRecord[]
    setError('')

    if (rows.length === 0) {
      try {
        const saved = window.localStorage.getItem('elements-roster-builder-v2')
        const parsed = saved ? JSON.parse(saved) as {
          activeLineupId?: string
          lineups?: Array<{
            id: string
            name: string
            assigned: Record<string, string>
            rosterFormat: 'compact' | 'full'
            useDh: boolean
          }>
        } : null
        const localLineups = parsed?.lineups?.slice(0, MAX_LINEUPS) ?? []

        if (localLineups.length > 0) {
          const inserts = localLineups.map((lineup, index) => ({
            user_id: user.id,
            name: lineup.name,
            is_active: lineup.id === parsed?.activeLineupId || (!parsed?.activeLineupId && index === 0),
            sort_order: index,
            use_dh: lineup.useDh,
            player_count: new Set(Object.values(lineup.assigned)).size,
            total_points: 0,
            roster_state: {
              assigned: lineup.assigned,
              rosterFormat: lineup.rosterFormat,
              useDh: lineup.useDh,
            },
          }))

          const { error: migrationError } = await supabase.from('lineups').insert(inserts)
          if (migrationError) setError(migrationError.message)
          else {
            window.localStorage.setItem('elements-lineups-migrated-to-supabase', 'true')
            await loadLineups()
            return
          }
        }
      } catch (migrationError) {
        console.error('Could not migrate local lineups:', migrationError)
      }
    }

    setLineups(rows)
    setLoading(false)
  }

  useEffect(() => {
    void loadLineups()
  }, [user?.id, isDemo])

  async function createLineup() {
    if (!user || lineups.length >= MAX_LINEUPS) return
    setWorking(true)
    setError('')

    const usedSortOrders = new Set(lineups.map((lineup) => lineup.sort_order))
    const nextSortOrder = [0, 1, 2].find((value) => !usedSortOrders.has(value))

    if (nextSortOrder === undefined) {
      setWorking(false)
      setError('No lineup slot is available.')
      return
    }

    const nextNumber = nextSortOrder + 1
    const { data, error: createError } = await supabase
      .from('lineups')
      .insert({
        user_id: user.id,
        name: `Lineup ${nextNumber}`,
        is_active: lineups.length === 0,
        sort_order: nextSortOrder,
        use_dh: true,
        player_count: 0,
        total_points: 0,
        roster_state: {
          assigned: {},
          rosterFormat: 'full',
          useDh: true,
        },
      })
      .select('id')
      .single()

    setWorking(false)
    if (createError) {
      setError(createError.message)
      return
    }
    navigate(appPath(`/lineup-builder/${data.id}`, isDemo))
  }


  async function updateLineupSettings(
    lineup: LineupRecord,
    changes: { useDh?: boolean; rosterFormat?: 'compact' | 'full' },
  ) {
    const nextUseDh = changes.useDh ?? lineup.use_dh
    const currentFormat = lineup.roster_state?.rosterFormat ?? 'full'
    const nextFormat = changes.rosterFormat ?? currentFormat

    setLineups((current) => current.map((item) => item.id === lineup.id ? {
      ...item,
      use_dh: nextUseDh,
      roster_state: {
        ...(item.roster_state ?? {}),
        rosterFormat: nextFormat,
        useDh: nextUseDh,
      },
    } : item))

    if (isDemo) return

    const { error: updateError } = await supabase
      .from('lineups')
      .update({
        use_dh: nextUseDh,
        roster_state: {
          ...(lineup.roster_state ?? {}),
          rosterFormat: nextFormat,
          useDh: nextUseDh,
        },
      })
      .eq('id', lineup.id)

    if (updateError) {
      setError(updateError.message)
      await loadLineups()
    }
  }

  async function openLineup(lineup: LineupRecord) {
    if (isDemo) {
      navigate('/demo/lineup-builder/sample')
      return
    }
    if (!lineup.is_active) {
      await supabase.rpc('set_active_lineup', { lineup_record_id: lineup.id })
    }
    navigate(`/lineup-builder/${lineup.id}`)
  }

  async function deleteLineup(lineup: LineupRecord) {
    if (isDemo) return
    if (!window.confirm(`Delete ${lineup.name}?`)) return
    setWorking(true)
    const { error: deleteError } = await supabase
      .from('lineups')
      .delete()
      .eq('id', lineup.id)

    if (deleteError) {
      setError(deleteError.message)
    } else {
      const remaining = lineups.filter((item) => item.id !== lineup.id)
      if (lineup.is_active && remaining.length > 0) {
        await supabase.rpc('set_active_lineup', { lineup_record_id: remaining[0].id })
      }
      await loadLineups()
    }
    setWorking(false)
  }

  return (
    <main className="lineup-selector-page">
      <div className="lineup-selector-heading">
        <div>
          <p className="eyebrow">Elements Baseball</p>
          <h1>Lineup Builder</h1>
          <p>Choose a current, past, or future build. You may save up to three lineups.</p>
        </div>
        <button type="button" className="back-button" onClick={() => navigate(appPath('/', isDemo))}>
          ← Home
        </button>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {loading ? (
        <section className="lineup-selector-loading">Loading your lineups…</section>
      ) : (
        <section className="lineup-selector-grid">
          {lineups.map((lineup) => (
            <article className={lineup.is_active ? 'lineup-selector-card active' : 'lineup-selector-card'} key={lineup.id}>
              <div className="lineup-card-topline">
                <span>{lineup.name}</span>
                {lineup.is_active && <strong>Active</strong>}
              </div>
              {(() => {
                const rosterFormat = lineup.roster_state?.rosterFormat ?? 'full'
                const playerLimit = rosterFormat === 'compact' ? 18 : 26
                const pointCap = rosterFormat === 'compact' ? 4000 : 6000

                return (
                  <>
                    <div className="lineup-card-stats lineup-card-stats-four">
                      <div><span>Players</span><strong>{lineup.player_count}/{playerLimit}</strong></div>
                      <div><span>Points</span><strong>{lineup.total_points.toLocaleString()}/{pointCap.toLocaleString()}</strong></div>
                      <div><span>DH</span><strong>{lineup.use_dh ? 'On' : 'Off'}</strong></div>
                      <div><span>Roster Size</span><strong>{playerLimit}/{pointCap.toLocaleString()}</strong></div>
                    </div>

                    <div className="lineup-card-settings">
                      <label>
                        <span>DH</span>
                        <select
                          value={lineup.use_dh ? 'on' : 'off'}
                          onChange={(event) => void updateLineupSettings(lineup, { useDh: event.target.value === 'on' })}
                        >
                          <option value="on">On</option>
                          <option value="off">Off</option>
                        </select>
                      </label>
                      <label>
                        <span>Roster</span>
                        <select
                          value={rosterFormat}
                          onChange={(event) => void updateLineupSettings(lineup, { rosterFormat: event.target.value as 'compact' | 'full' })}
                        >
                          <option value="compact">18 / 4,000</option>
                          <option value="full">26 / 6,000</option>
                        </select>
                      </label>
                    </div>
                  </>
                )
              })()}
              <div className="lineup-card-actions">
                <button type="button" onClick={() => void openLineup(lineup)}>Open</button>
                {!isDemo && <button type="button" className="danger" disabled={working} onClick={() => void deleteLineup(lineup)}>Delete</button>}
              </div>
            </article>
          ))}

          {!isDemo && <button
            type="button"
            className="lineup-create-card"
            onClick={() => void createLineup()}
            disabled={lineups.length >= MAX_LINEUPS || working}
          >
            <span>+</span>
            <strong>Create New</strong>
            <small>
              {lineups.length >= MAX_LINEUPS
                ? 'Maximum of three lineups reached'
                : `${MAX_LINEUPS - lineups.length} lineup slot${MAX_LINEUPS - lineups.length === 1 ? '' : 's'} available`}
            </small>
          </button>}
        </section>
      )}
    </main>
  )
}
