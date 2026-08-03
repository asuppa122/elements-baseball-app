import { useEffect, useMemo, useState } from 'react'
import { discordIdentityFromUser, useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

type AvailableManager = {
  id: number
  manager_name: string
  expected_discord_username: string | null
}

export default function ManagerClaimPage() {
  const { user, refreshProfile, signOut } = useAuth()
  const [managers, setManagers] = useState<AvailableManager[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const identity = useMemo(
    () => (user ? discordIdentityFromUser(user) : null),
    [user],
  )

  const normalizedDiscordUsername = useMemo(
    () =>
      identity?.username
        ?.trim()
        .replace(/#\d{1,4}$/, '')
        .toLowerCase() ?? '',
    [identity?.username],
  )

  useEffect(() => {
    async function loadManagers() {
      const { data, error: loadError } = await supabase
        .from('elements_managers')
        .select('id, manager_name, expected_discord_username')
        .is('claimed_by_user_id', null)
        .order('manager_name')

      if (loadError) {
        setError(loadError.message)
      } else {
        const rows = (data ?? []) as AvailableManager[]
        setManagers(rows)

        const match = rows.find(
          (row) =>
            row.expected_discord_username?.trim().toLowerCase() ===
            normalizedDiscordUsername,
        )

        setSelectedId(match?.id ?? null)
      }

      setLoading(false)
    }

    void loadManagers()
  }, [normalizedDiscordUsername])

  async function claimManager() {
    if (!user || !selectedId || !identity || !normalizedDiscordUsername) return

    setSaving(true)
    setError('')

    const { error: claimError } = await supabase.rpc('claim_elements_manager', {
      manager_record_id: selectedId,
      discord_account_id: identity.discordId,
      discord_username_value: normalizedDiscordUsername,
      discord_display_name_value: identity.displayName,
      avatar_url_value: identity.avatarUrl,
    })

    if (claimError) {
      setError(claimError.message)
      setSaving(false)
      return
    }

    await refreshProfile()
    setSaving(false)
  }

  return (
    <main className="auth-screen claim-screen">
      <section className="claim-card">
        <p className="eyebrow">First-time setup</p>
        <h1>Claim your Elements manager</h1>
        <p>
          Signed in as{' '}
          <strong>
            {identity?.username ?? identity?.displayName ?? 'Discord user'}
          </strong>
          . Select the manager account that belongs to you. This connects your
          existing cards and future lineups to your Discord account.
        </p>

        {loading ? (
          <div className="claim-loading">Loading available managers…</div>
        ) : (
          <div className="manager-claim-grid">
            {managers.map((manager) => (
              <button
                type="button"
                className={
                  selectedId === manager.id
                    ? 'manager-claim active'
                    : 'manager-claim'
                }
                onClick={() => setSelectedId(manager.id)}
                key={manager.id}
              >
                <strong>{manager.manager_name}</strong>
                <span>
                  {manager.expected_discord_username ??
                    'Pre-approved manager'}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="claim-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => void signOut()}
          >
            Use another Discord account
          </button>

          <button
            type="button"
            onClick={claimManager}
            disabled={!selectedId || saving}
          >
            {saving ? 'Claiming…' : 'Confirm manager'}
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}
      </section>
    </main>
  )
}
