import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { GameCardSnapshot } from '../types'

/**
 * Tap any card to see it full size.
 *
 * One viewer per screen, opened from wherever a card is drawn. The art itself
 * is the button, and it is never the same element as an action: a card that
 * is also a choice (a pregame pick) gets a separate magnifier beside it, so
 * looking at a card can never pick, sub or confirm anything.
 */

type Zoom = (card: GameCardSnapshot) => void
const ZoomContext = createContext<Zoom | null>(null)

export function CardZoomProvider({ children }: { children: ReactNode }) {
  const [card, setCard] = useState<GameCardSnapshot | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  const open = useCallback<Zoom>((next) => {
    returnTo.current = document.activeElement as HTMLElement | null
    setCard(next)
  }, [])
  const close = useCallback(() => {
    setCard(null)
    returnTo.current?.focus?.()
  }, [])

  useEffect(() => {
    if (!card) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, close])

  return (
    <ZoomContext.Provider value={open}>
      {children}
      {card && (
        <div className="gp-zoom" role="dialog" aria-modal="true" aria-label={`${card.playerName} card`} onClick={close}>
          <figure className="gp-zoom-figure" onClick={(e) => e.stopPropagation()}>
            {card.imageUrl
              ? <img src={card.imageUrl} alt={`${card.playerName} card`} referrerPolicy="no-referrer" />
              : <div className="gp-zoom-missing">No card image</div>}
            <figcaption>{card.playerName}{card.year ? ` · ${card.year}` : ''}</figcaption>
          </figure>
          <button ref={closeRef} type="button" className="gp-zoom-close" onClick={close} aria-label="Close card">×</button>
        </div>
      )}
    </ZoomContext.Provider>
  )
}

export function useCardZoom(): Zoom {
  return useContext(ZoomContext) ?? (() => undefined)
}

/** The card art as a button that enlarges it. Drop-in for the `<img>` inside an art slot. */
export function CardArt({ card, className, src }: { card: GameCardSnapshot | null | undefined; className?: string; src?: string | null }) {
  const zoom = useCardZoom()
  if (!card) return <span className={className}><i aria-hidden="true" /></span>
  const url = src ?? card.imageUrl
  return (
    <button type="button" className={`gp-card-art-btn${className ? ` ${className}` : ''}`}
      aria-label={`Enlarge ${card.playerName}'s card`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); zoom(card) }}>
      {url ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <i aria-hidden="true" />}
    </button>
  )
}

/** A small magnifier for a card that is itself a button. */
export function ZoomButton({ card }: { card: GameCardSnapshot }) {
  const zoom = useCardZoom()
  return (
    <button type="button" className="gp-zoom-btn" aria-label={`Enlarge ${card.playerName}'s card`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); zoom(card) }}>
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    </button>
  )
}
