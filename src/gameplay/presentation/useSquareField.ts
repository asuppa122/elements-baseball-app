import { useLayoutEffect, type RefObject } from 'react'

/**
 * Keeps the field square on the desktop stage.
 *
 * The field art is a 680x680 render and every fielder and runner is placed in
 * percentages of it, so a field that is not square is a stretched picture
 * with everyone in slightly the wrong place -- which is what the stage did:
 * the field filled its column's width and was stretched to its height (587 x
 * 695 at 1440x900). CSS alone cannot size it, because its space is "the
 * column minus the DEF strip", and the strip wraps on a narrow column.
 *
 * So the field column and the strip are measured, the largest square that
 * fits above the strip is published as --field-size on the column, and the
 * field and the strip both read it -- which is also what lines the strip up
 * under the field. Below the desktop breakpoint the CSS ignores the variable
 * and the field is as wide as its column, as before.
 */
export function useSquareField(column: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const host = column.current
    if (!host || typeof ResizeObserver === 'undefined') return
    const strip = host.querySelector<HTMLElement>(':scope > .gp-defbar')
    const update = () => {
      const gap = parseFloat(getComputedStyle(host).rowGap) || 0
      const height = host.clientHeight - (strip?.offsetHeight ?? 0) - gap
      const size = Math.floor(Math.min(host.clientWidth, height))
      if (size > 0) host.style.setProperty('--field-size', `${size}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    if (strip) observer.observe(strip)
    return () => observer.disconnect()
  }, [column])
}
