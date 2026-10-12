import { useLayoutEffect, useRef } from 'react'
import { COUNT_UP_MS, REVEAL_INSET_PX, countUpAt } from '../../lib/scrollReveal'
import { canAnimateReveal, hasInteracted, inViewport } from '../../hooks/useScrollReveal'

/**
 * A figure that counts up from 0 to `value` the first time it scrolls into view.
 * Shows the final number straight away for reduced motion, for a number that
 * mounts on screen after the visitor has clicked, and for every change after
 * the first count (a live figure never counts again).
 *
 * The span's text is written directly (no React children) so a frame of
 * counting never fights a re-render.
 */
export default function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const played = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const final = value.toLocaleString()
    if (played.current || value <= 0 || !canAnimateReveal() || (hasInteracted() && inViewport(el))) {
      el.textContent = final
      return
    }
    el.textContent = '0'
    let frame = 0
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        io.disconnect()
        played.current = true
        const start = performance.now()
        const tick = (now: number) => {
          const p = (now - start) / COUNT_UP_MS
          el.textContent = countUpAt(p, value).toLocaleString()
          if (p < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      },
      { threshold: 0, rootMargin: `0px 0px -${REVEAL_INSET_PX}px 0px` },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(frame)
      el.textContent = final
    }
  }, [value])

  return <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }} />
}
