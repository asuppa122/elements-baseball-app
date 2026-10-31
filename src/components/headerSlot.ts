import { createContext, useContext } from 'react'

/**
 * A slot in the app header that a page can render into (with createPortal).
 * The gameplay screen puts its scoreboard and tools there on desktop, so the
 * game spends no height of its own on navigation. Null outside a shell, and
 * until the header has mounted.
 */
export const HeaderSlotContext = createContext<HTMLElement | null>(null)

export function useHeaderSlot(): HTMLElement | null {
  return useContext(HeaderSlotContext)
}
