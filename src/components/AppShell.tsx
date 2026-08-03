import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import logo from '../assets/elements-baseball-logo.png'
import { appPath } from '../lib/appPaths'

export default function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { profile, signOut, isDemo } = useAuth()

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
            <>
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="global-user-avatar" />
              ) : (
                <div className="global-user-avatar fallback">
                  {profile?.manager_name?.slice(0, 1) ?? 'E'}
                </div>
              )}
              <div>
                <strong>{profile?.manager_name}</strong>
                <span>{profile?.discord_display_name ?? profile?.discord_username}</span>
              </div>
              <button type="button" onClick={() => void signOut()}>Log out</button>
            </>
          )}
        </div>
      </header>
      {children}
    </div>
  )
}
