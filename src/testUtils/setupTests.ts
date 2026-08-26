// Global Vitest setup: adds jest-dom's DOM matchers (toBeDisabled(),
// toHaveTextContent(), etc.) to `expect`. Safe to load for every test file,
// including the 'node'-environment ones from earlier Tier 5 work -- it only
// extends `expect`, it doesn't touch the DOM at import time.
import '@testing-library/jest-dom/vitest'

// React Testing Library's automatic per-test cleanup relies on detecting a
// global `afterEach` -- this project doesn't enable Vitest's `globals: true`
// (test files import describe/it/expect explicitly), so that auto-detection
// never fires and renders would otherwise leak across tests within the same
// file/jsdom document. Register it explicitly instead.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
