import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts on purpose: the gameplay scenario harnesses under
// test are pure TS logic (no DOM), so this stays on the lightweight 'node'
// environment rather than pulling in jsdom. Add an `environment: 'jsdom'`
// override here (or per-file via a docblock) when component tests are added.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.mjs'],
    setupFiles: ['src/testUtils/setupTests.ts'],
  },
})
