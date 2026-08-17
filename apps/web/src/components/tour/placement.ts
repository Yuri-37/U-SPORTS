/**
 * Pure placement math for the tour card, given a target rect and a card
 * size. Deliberately minimal compared to floating-ui: four sides, one flip,
 * cross-axis clamp, center fallback. No virtual elements, no arrow-shift
 * middleware, no ancestor-transform tracking — this app doesn't need them.
 *
 * getBoundingClientRect() returns viewport coordinates, and `position:
 * fixed` consumes viewport coordinates, so there's no document-offset math
 * or scroll accumulation to do here.
 */

export type Side = 'top' | 'bottom' | 'left' | 'right' | 'center'

export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export interface CardSize {
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

export interface Placement {
  side: Side
  top: number
  left: number
}

const GAP = 12 // target -> card
const MARGIN = 16 // card -> viewport edge
const NARROW_VIEWPORT = 640

const OPPOSITE: Record<Exclude<Side, 'center'>, Side> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

/** The two sides not on the preferred/opposite axis, tried last. */
function crossSides(side: Exclude<Side, 'center'>): Side[] {
  return side === 'top' || side === 'bottom' ? ['right', 'left'] : ['bottom', 'top']
}

function mainAxisFits(side: Side, target: Box, card: CardSize, viewport: Viewport): boolean {
  switch (side) {
    case 'top':
      return target.top - GAP - card.height >= 0
    case 'bottom':
      return target.top + target.height + GAP + card.height <= viewport.height
    case 'left':
      return target.left - GAP - card.width >= 0
    case 'right':
      return target.left + target.width + GAP + card.width <= viewport.width
    case 'center':
      return true
  }
}

function rawPosition(side: Side, target: Box, card: CardSize): { top: number; left: number } {
  const centerY = target.top + target.height / 2 - card.height / 2
  const centerX = target.left + target.width / 2 - card.width / 2
  switch (side) {
    case 'top':
      return { top: target.top - GAP - card.height, left: centerX }
    case 'bottom':
      return { top: target.top + target.height + GAP, left: centerX }
    case 'left':
      return { top: centerY, left: target.left - GAP - card.width }
    case 'right':
      return { top: centerY, left: target.left + target.width + GAP }
    case 'center':
      return { top: centerY, left: centerX }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

function centerOf(card: CardSize, viewport: Viewport): { top: number; left: number } {
  return {
    top: clamp((viewport.height - card.height) / 2, MARGIN, viewport.height - card.height - MARGIN),
    left: clamp((viewport.width - card.width) / 2, MARGIN, viewport.width - card.width - MARGIN),
  }
}

export function computePlacement(
  target: Box,
  card: CardSize,
  viewport: Viewport,
  preferred: Side = 'bottom',
): Placement {
  if (viewport.width < NARROW_VIEWPORT) {
    const c = centerOf(card, viewport)
    return { side: 'center', ...c }
  }

  const order: Side[] =
    preferred === 'center'
      ? ['center']
      : [preferred, OPPOSITE[preferred], ...crossSides(preferred)]

  for (const side of order) {
    if (!mainAxisFits(side, target, card, viewport)) continue
    const raw = rawPosition(side, target, card)
    const top = clamp(raw.top, MARGIN, Math.max(MARGIN, viewport.height - card.height - MARGIN))
    const left = clamp(raw.left, MARGIN, Math.max(MARGIN, viewport.width - card.width - MARGIN))
    return { side, top, left }
  }

  const c = centerOf(card, viewport)
  return { side: 'center', ...c }
}
