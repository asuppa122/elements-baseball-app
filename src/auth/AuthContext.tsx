import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type ManagerProfile = {
  user_id: string
  manager_name: string
  discord_id: string | null
  discord_username: string | null
  discord_display_name: string | null
  avatar_url: string | null
  is_admin: boolean
}

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: ManagerProfile | null
  loading: boolean
  profileLoading: boolean
  refreshProfile: () => Promise<void>
  signInWithDiscord: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function getDiscordMetadata(user: User) {
  const identity = user.identities?.find(
    (item) => item.provider === 'discord',
  )
  const metadata = user.user_metadata ?? {}

  return {
    discordId:
      identity?.identity_data?.provider_id ??
      identity?.id ??
      null,
    username:
      metadata.user_name ??
      metadata.preferred_username ??
      metadata.name ??
      null,
    displayName:
      metadata.full_name ??
      metadata.global_name ??
      metadata.name ??
      null,
    avatarUrl:
      metadata.avatar_url ??
      metadata.picture ??
      null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ManagerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  async function loadProfile(nextSession: Session | null) {
    if (!nextSession?.user) {
      setProfile(null)
      return
    }

    setProfileLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'user_id, manager_name, discord_id, discord_username, discord_display_name, avatar_url, is_admin',
      )
      .eq('user_id', nextSession.user.id)
      .maybeSingle()

    if (error) {
      console.error('Could not load manager profile:', error)
      setProfile(null)
    } else {
      setProfile((data as ManagerProfile | null) ?? null)
    }
    setProfileLoading(false)
  }

  useEffect(() => {
    let mounted = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      void loadProfile(data.session).finally(() => {
        if (mounted) setLoading(false)
      })
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        void loadProfile(nextSession)
        setLoading(false)
      },
    )

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  async function refreshProfile() {
    await loadProfile(session)
  }

  async function signInWithDiscord() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut({ scope: 'local' })
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileLoading,
      refreshProfile,
      signInWithDiscord,
      signOut,
    }),
    [session, profile, loading, profileLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return value
}

export function discordIdentityFromUser(user: User) {
  return getDiscordMetadata(user)
}
