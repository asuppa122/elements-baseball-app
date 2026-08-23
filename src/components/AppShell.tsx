import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import logo from '../assets/elements-baseball-logo.png'
import { appPath } from '../lib/appPaths'

export default function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, signOut, isDemo } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)


  useEffect(() => {
    const storageKey = `elements:scroll:${location.pathname}${location.search}`
    const saved = sessionStorage.getItem(storageKey)
    if (saved !== null) {
      const y = Number(saved)
      if (Number.isFinite(y)) requestAnimationFrame(() => window.scrollTo({ top: y, left: 0 }))
    }

    const remember = () => {
      sessionStorage.setItem(storageKey, String(window.scrollY))
    }

    // pagehide covers real reload/navigation/tab discard. visibilitychange is
    // intentionally save-only: becoming visible never triggers a reload/refetch.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') remember()
    }
    window.addEventListener('pagehide', remember)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      remember()
      window.removeEventListener('pagehide', remember)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!profileOpen) return
    const close = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [profileOpen])

  const homePath = appPath('/', isDemo)
  const isHome = location.pathname === homePath

  function goBack() {
    if (location.key !== 'default') {
      navigate(-1)
      return
    }

    navigate(homePath)
  }

  return (
    <div className="authenticated-app">
      <header className="global-app-header">
        <div className="global-header-navigation">
          {!isHome && (
            <button type="button" className="global-back-button" onClick={goBack} aria-label="Go back">
              <span aria-hidden="true">←</span>
            </button>
          )}
        <button type="button" className="global-brand" onClick={() => navigate(homePath)}>
          <img src={logo} alt="Elements Baseball" />
          <span>Elements Baseball</span>
        </button>
        </div>

        <div className="global-user-menu">
          {isDemo ? (
            <>
              <div className="demo-mode-badge">Demo Mode</div>
              <div className="demo-mode-copy">
                <strong>Public Preview</strong>
                <span>Changes are not saved</span>
              </div>
            </>
          ) : (
            <div className="profile-menu-wrap" ref={profileMenuRef}>
              <button
                type="button"
                className="profile-menu-trigger"
                aria-expanded={profileOpen}
                onClick={() => setProfileOpen((open) => !open)}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="global-user-avatar" />
                ) : (
                  <div className="global-user-avatar fallback">
                    {profile?.manager_name?.slice(0, 1) ?? 'E'}
                  </div>
                )}
                <div className="profile-menu-trigger-copy">
                  <strong>{profile?.manager_name}</strong>
                  <span>{profile?.discord_display_name ?? profile?.discord_username}</span>
                </div>
                <span className="profile-menu-chevron" aria-hidden="true">⌄</span>
              </button>

              {profileOpen && (
                <div className="profile-menu-popover">
                  <div className="profile-menu-identity">
                    <strong>{profile?.manager_name}</strong>
                    <span>{profile?.discord_display_name ?? profile?.discord_username}</span>
                  </div>
                  <button type="button" onClick={() => void signOut()}>Log out</button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>
      {children}
    </div>
  )
}
