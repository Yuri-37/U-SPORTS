/**
 * Scroll-reveal timing shared by every public page. Mirrors AppMotion.reveal* in
 * mobile/lib/theme/motion.dart, so the site and the app move the same way.
 *
 * Deliberately dramatic: cards rise 70px from 85% size and settle with a small
 * overshoot (see `--ease-spring` and the [data-reveal] rules in index.css).
 */
export type RevealKind = 'card' | 'row' | 'heading'

/** Gap between items that come into view together. */
export const REVEAL_STEP_MS = 100

/**
 * No item waits longer than this. With the longest move (800ms) the last item
 * of any batch has landed by 1.2s.
 */
export const REVEAL_MAX_DELAY_MS = 400

/** Distance above the bottom of the viewport an item must pass before it reveals. */
export const REVEAL_INSET_PX = 48

export function revealDelayMs(index: number): number {
  return Math.min(Math.max(0, index) * REVEAL_STEP_MS, REVEAL_MAX_DELAY_MS)
}

/** How long a stat number takes to count up to its value. */
export const COUNT_UP_MS = 1400

/** The number shown `progress` (0..1) of the way through a count-up: fast, then easing in. */
export function countUpAt(progress: number, target: number): number {
  const p = Math.min(Math.max(progress, 0), 1)
  return Math.round(target * (1 - Math.pow(1 - p, 3)))
}
