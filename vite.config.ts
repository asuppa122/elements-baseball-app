import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // PGlite ships its own wasm and must not be pre-bundled by esbuild. It is only
  // used by the dev-only /sandbox/duel page and the two-player SQL test.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
})
