import { useEffect, useRef, useState } from 'react'
import type { Box } from './placement'

export type AnchorStatus = 'waiting' | 'settling' | 'found' | 'not-found'

export interface AnchorResult {
  status: AnchorStatus
  rect: Box | null
  element: Element | null
}

const WAIT_AFTER_NAV_MS = 6000 // lazy chunk + data fetch
const WAIT_SAME_ROUTE_MS = 2500
const SETTLE_MAX_MS = 600
const DISAPPEAR_GRACE_MS = 400
const DISAPPEAR_REWAIT_MS = 1500

function toBox(rect: DOMRect): Box {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

function isZeroRect(rect: DOMRect): boolean {
  return rect.width === 0 && rect.height === 0
}

function resolveTarget(selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el) {
      const rect = el.getBoundingClientRect()
      if (!isZeroRect(rect)) return el
    }
  }
  return null
}

/**
 * Resolves a tour step's target (ordered fallback selectors) against the
 * live DOM: waits for it to appear, waits for its geometry to stabilize,
 * then keeps lightly re-checking it hasn't disappeared for as long as the
 * step is active.
 *
 * One continuous rAF loop, not MutationObserver — several anchors appear by
 * skeleton-replacement or become non-zero-sized after a layout shift with no
 * DOM mutation, so existence and geometry are checked together on every
 * tick rather than reacting to mutations and then re-measuring anyway.
 */
export function useAnchor(
  targets: string[] | undefined,
  opts: { justNavigated: boolean; waitMs?: number },
): AnchorResult {
  const [result, setResult] = useState<AnchorResult>({ status: 'waiting', rect: null, element: null })

  useEffect(() => {
    if (!targets || targets.length === 0) {
      setResult({ status: 'found', rect: null, element: null })
      return
    }

    let cancelled = false
    let frame = 0
    let tick = 0
    // 'initial' = the first appearance-wait; 'settle' = geometry stabilizing;
    // 'watch' = already found, lightly polling for disappearance;
    // 'rewait' = just disappeared, bounded second chance before giving up.
    let mode: 'initial' | 'settle' | 'watch' | 'rewait' = 'initial'
    let deadline = Date.now() + (opts.waitMs ?? (opts.justNavigated ? WAIT_AFTER_NAV_MS : WAIT_SAME_ROUTE_MS))
    let settleEl: Element | null = null
    let settleDeadline = 0
    let lastKey: string | null = null
    let stableFrames = 0
    let disappearedAt: number | null = null

    setResult({ status: 'waiting', rect: null, element: null })

    const enterSettle = (el: Element) => {
      mode = 'settle'
      settleEl = el
      settleDeadline = Date.now() + SETTLE_MAX_MS
      lastKey = null
      stableFrames = 0
    }

    const tickFn = () => {
      if (cancelled) return
      tick += 1

      if (mode === 'initial' || mode === 'rewait') {
        // Every 2nd frame — existence/geometry doesn't need 60fps polling.
        if (tick % 2 === 0) {
          const el = resolveTarget(targets)
          if (el) {
            enterSettle(el)
          } else if (Date.now() > deadline) {
            setResult({ status: 'not-found', rect: null, element: null })
            return
          }
        }
      } else if (mode === 'settle' && settleEl) {
        const rect = settleEl.getBoundingClientRect()
        if (isZeroRect(rect) || !settleEl.isConnected) {
          mode = 'initial' // collapsed mid-settle — go back to waiting, not a 0×0 spot
        } else {
          const key = `${rect.top},${rect.left},${rect.width},${rect.height}`
          stableFrames = key === lastKey ? stableFrames + 1 : 0
          lastKey = key
          if (stableFrames >= 2 || Date.now() > settleDeadline) {
            mode = 'watch'
            setResult({ status: 'found', rect: toBox(rect), element: settleEl })
          }
        }
      } else if (mode === 'watch' && settleEl) {
        // Cheap: every 6th frame (~10Hz) is plenty for "did this disappear".
        if (tick % 6 === 0) {
          const rect = settleEl.getBoundingClientRect()
          const gone = !settleEl.isConnected || isZeroRect(rect)
          if (gone) {
            if (disappearedAt === null) disappearedAt = Date.now()
            // Grace period: a fast re-mount (StrictMode, a quick refetch)
            // resolves within this window and we never report anything —
            // no visible flicker. Only fall to 'waiting' once it's been
            // gone longer than that.
            if (Date.now() - disappearedAt > DISAPPEAR_GRACE_MS) {
              mode = 'rewait'
              deadline = Date.now() + DISAPPEAR_REWAIT_MS
              setResult({ status: 'waiting', rect: null, element: null })
            }
          } else {
            disappearedAt = null
          }
        }
      }

      frame = requestAnimationFrame(tickFn)
    }

    frame = requestAnimationFrame(tickFn)

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets?.join('|'), opts.justNavigated])

  return result
}

export const ANCHOR_WAIT_TIMEOUTS = {
  WAIT_AFTER_NAV_MS,
  WAIT_SAME_ROUTE_MS,
  SETTLE_MAX_MS,
  DISAPPEAR_GRACE_MS,
  DISAPPEAR_REWAIT_MS,
}
