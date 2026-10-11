/**
 * Scroll-reveal timing shared by every public page. Mirrors AppMotion.reveal*
 * in mobile/lib/theme/motion.dart, so the site and the app move the same way.
 */
export type RevealKind = 'card' | 'row'

/** Gap between items that come into view together. */
export const REVEAL_STEP_MS: Record<RevealKind, number> = { card: 40, row: 20 }

/** No item waits longer than this, however many arrive at once. */
export const REVEAL_MAX_DELAY_MS: Record<RevealKind, number> = { card: 200, row: 120 }

/** Distance above the bottom of the viewport an item must pass before it reveals. */
export const REVEAL_INSET_PX = 48

export function revealDelayMs(index: number, kind: RevealKind): number {
  return Math.min(Math.max(0, index) * REVEAL_STEP_MS[kind], REVEAL_MAX_DELAY_MS[kind])
}
