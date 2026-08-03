import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import logo from '../assets/elements-baseball-logo.png'
import { appPath } from '../lib/appPaths'

export default function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { profile, signOut, isDemo } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!profileOpen) return
    const close = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [profileOpen])

  return (
    <div className="authenticated-app">
      <header className="global-app-header">
        <button type="button" className="global-brand" onClick={() => navigate(appPath('/', isDemo))}>
          <img src={logo} alt="Elements Baseball" />
          <span>Elements Baseball</span>
        </button>

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
