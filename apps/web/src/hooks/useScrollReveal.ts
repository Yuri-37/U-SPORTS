import { useEffect, useMemo, useRef } from 'react'
import { REVEAL_INSET_PX, revealDelayMs, type RevealKind } from '../lib/scrollReveal'

type RevealRef = (el: HTMLElement | null) => void | (() => void)

const canAnimate = () =>
  typeof IntersectionObserver !== 'undefined' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

const inViewport = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return r.top < window.innerHeight && r.bottom > 0
}

/**
 * Items fade and rise once as they scroll into view. Call once per page and
 * put `reveal.card` or `reveal.row` on each item's `ref`.
 *
 * After the visitor's first click or key press, anything that mounts already
 * on screen (a tab, a filter, a live update) shows at once; only what is
 * still below the fold waits to be scrolled to.
 */
export function useScrollReveal(): { card: RevealRef; row: RevealRef } {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const interactedRef = useRef(false)

  useEffect(() => {
    const mark = () => {
      interactedRef.current = true
    }
    window.addEventListener('pointerdown', mark, { capture: true, passive: true })
    window.addEventListener('keydown', mark, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', mark, { capture: true })
      window.removeEventListener('keydown', mark, { capture: true })
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [])

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
            const kind: RevealKind = el.dataset.revealKind === 'row' ? 'row' : 'card'
            el.style.setProperty('--reveal-delay', `${revealDelayMs(i, kind)}ms`)
            el.dataset.reveal = 'shown'
            const done = (ev: AnimationEvent) => {
              // Ignore animations bubbling up from inside the card (score pops, pulses).
              if (ev.target !== el || !ev.animationName.startsWith('reveal-up')) return
              el.removeEventListener('animationend', done)
              delete el.dataset.reveal
              delete el.dataset.revealKind
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
          if (!canAnimate()) return
          if (interactedRef.current && inViewport(el)) return
          el.dataset.reveal = 'pending'
          el.dataset.revealKind = kind
        }
        const io = observer()
        io.observe(el)
        return () => io.unobserve(el)
      }

    return { card: attach('card'), row: attach('row') }
  }, [])
}
