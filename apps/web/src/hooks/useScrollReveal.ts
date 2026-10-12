import { useEffect, useMemo, useRef } from 'react'
import { REVEAL_INSET_PX, revealDelayMs, type RevealKind } from '../lib/scrollReveal'

type RevealRef = (el: HTMLElement | null) => void | (() => void)

/** True once the visitor has clicked or pressed a key anywhere on the site. */
let interacted = false
if (typeof window !== 'undefined') {
  const mark = () => {
    interacted = true
  }
  window.addEventListener('pointerdown', mark, { capture: true, passive: true })
  window.addEventListener('keydown', mark, { capture: true })
}

export const hasInteracted = () => interacted

/** False when the visitor asked for reduced motion, or the browser cannot observe. */
export const canAnimateReveal = () =>
  typeof IntersectionObserver !== 'undefined' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const inViewport = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return r.top < window.innerHeight && r.bottom > 0
}

/**
 * Items fly in once as they scroll into view. Call once per page and put
 * `reveal.card`, `reveal.row` or `reveal.heading` on each item's `ref`.
 *
 * Rows alternate between sliding in from the left and from the right.
 *
 * After the visitor's first click or key press, anything that mounts already
 * on screen (a tab, a filter, a live update) shows at once; only what is still
 * below the fold waits to be scrolled to.
 */
export function useScrollReveal(): { card: RevealRef; row: RevealRef; heading: RevealRef } {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const rowCountRef = useRef(0)

  useEffect(
    () => () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    },
    [],
  )

  return useMemo(() => {
    const observer = () => {
      if (observerRef.current) return observerRef.current
      const io = new IntersectionObserver(
        (entries) => {
          const entering = entries
            .filter((e) => e.isIntersecting)
            .sort(
              (a, b) =>
                a.boundingClientRect.top - b.boundingClientRect.top ||
                a.boundingClientRect.left - b.boundingClientRect.left,
            )
          entering.forEach((entry, i) => {
            const el = entry.target as HTMLElement
            io.unobserve(el)
            el.style.setProperty('--reveal-delay', `${revealDelayMs(i)}ms`)
            el.dataset.reveal = 'shown'
            const done = (ev: AnimationEvent) => {
              // Only the long move animation ends the reveal; ignore the quicker
              // fade and anything bubbling up from inside the card.
              if (ev.target !== el || !ev.animationName.startsWith('reveal-move')) return
              el.removeEventListener('animationend', done)
              delete el.dataset.reveal
              delete el.dataset.revealKind
              delete el.dataset.revealSide
              el.style.removeProperty('--reveal-delay')
            }
            el.addEventListener('animationend', done)
          })
        },
        { threshold: 0, rootMargin: `0px 0px -${REVEAL_INSET_PX}px 0px` },
      )
      observerRef.current = io
      return io
    }

    const attach =
      (kind: RevealKind): RevealRef =>
      (el) => {
        if (!el || el.dataset.reveal === 'shown') return
        if (el.dataset.reveal !== 'pending') {
          if (!canAnimateReveal()) return
          if (interacted && inViewport(el)) return
          el.dataset.reveal = 'pending'
          el.dataset.revealKind = kind
          if (kind === 'row') el.dataset.revealSide = rowCountRef.current++ % 2 === 0 ? 'left' : 'right'
        }
        const io = observer()
        io.observe(el)
        return () => io.unobserve(el)
      }

    return { card: attach('card'), row: attach('row'), heading: attach('heading') }
  }, [])
}
