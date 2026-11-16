import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'

const STORAGE_KEY = 'usports_scroll_positions'
const MAX_REMEMBERED = 200
/** How long to wait for a page to grow tall enough before going as far as it goes. */
const GIVE_UP_MS = 5000
/** After arriving, keep the spot this long: sections above it finish loading and shift it. */
const SETTLE_MS = 1500

function readStored(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function writeStored(positions: Record<string, number>) {
  try {
    const keys = Object.keys(positions)
    if (keys.length > MAX_REMEMBERED) {
      for (const k of keys.slice(0, keys.length - MAX_REMEMBERED)) delete positions[k]
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
  } catch {
    /* private mode or storage full: the page simply opens at the top */
  }
}

/**
 * Scroll memory for the whole site.
 *
 * - Opening a page starts it at the top (or at its #anchor).
 * - Going Back/Forward returns to where you were on that page, even when the page
 *   fills in after it opens. The router's built-in ScrollRestoration puts the page
 *   back at once, while the hub is still loading and only a screen tall, so the
 *   browser clamped it to the top. This waits until the page is tall enough.
 *
 * Positions are kept per history entry in sessionStorage, so they survive a reload
 * of the tab but not a new one.
 */
export default function ScrollMemory() {
  const location = useLocation()
  const navType = useNavigationType()
  const positions = useRef<Record<string, number>>(readStored())
  const currentKey = useRef(location.key)
  /** True while a restore is waiting for the page to grow: those scrolls are not the person's. */
  const restoring = useRef(false)

  // Take over from the browser, which restores too early for pages that load their content.
  useEffect(() => {
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])

  // Remember where the person is on the current entry.
  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (restoring.current || frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        if (!restoring.current) positions.current[currentKey.current] = Math.round(window.scrollY)
      })
    }
    const flush = () => writeStored(positions.current)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  // On every navigation: top for a new page, the remembered spot for Back/Forward.
  useLayoutEffect(() => {
    writeStored(positions.current)
    currentKey.current = location.key

    if (navType !== 'POP') {
      const id = location.hash ? decodeURIComponent(location.hash.slice(1)) : ''
      const target = id ? document.getElementById(id) : null
      if (target) target.scrollIntoView()
      else window.scrollTo(0, 0)
      return
    }

    const wanted = positions.current[location.key] ?? 0
    if (wanted <= 0) {
      window.scrollTo(0, 0)
      return
    }

    restoring.current = true
    const started = Date.now()
    let arrivedAt = 0
    let interval = 0
    let observer: ResizeObserver | undefined

    const finish = () => {
      restoring.current = false
      window.clearInterval(interval)
      observer?.disconnect()
      window.removeEventListener('wheel', finish)
      window.removeEventListener('touchstart', finish)
      window.removeEventListener('keydown', finish)
      window.removeEventListener('pointerdown', finish)
    }

    const attempt = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight
      if (room >= wanted - 1) {
        if (!arrivedAt) arrivedAt = Date.now()
        if (Math.abs(window.scrollY - wanted) > 1) window.scrollTo(0, wanted)
        if (Date.now() - arrivedAt > SETTLE_MS) finish()
      } else if (Date.now() - started > GIVE_UP_MS) {
        window.scrollTo(0, Math.max(0, room))
        finish()
      }
    }

    // The person taking over (wheel, touch, key, click) ends the wait at once.
    window.addEventListener('wheel', finish, { passive: true })
    window.addEventListener('touchstart', finish, { passive: true })
    window.addEventListener('keydown', finish)
    window.addEventListener('pointerdown', finish)
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(attempt)
      observer.observe(document.body)
    }
    interval = window.setInterval(attempt, 100)
    attempt()

    return finish
  }, [location.key, location.hash, navType])

  return null
}
