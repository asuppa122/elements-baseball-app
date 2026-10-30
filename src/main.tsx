import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// A deploy replaces the hashed page chunks. A tab opened before it still asks
// for the old ones, gets index.html back, and the page goes blank -- seen on
// the live site right after the v1.5.2 deploy. Vite reports that as
// vite:preloadError; reload once to pick up the new build. The timestamp
// guard stops a reload loop if the chunk is genuinely missing.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'elements:chunk-reload'
  let last = 0
  try { last = Number(sessionStorage.getItem(key) ?? 0) } catch { /* storage unavailable */ }
  if (Date.now() - last < 30_000) return
  try { sessionStorage.setItem(key, String(Date.now())) } catch { /* storage unavailable */ }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
