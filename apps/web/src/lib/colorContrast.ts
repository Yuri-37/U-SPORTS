/**
 * Small colour helpers for the school's two brand colours: how readable one is
 * on the other, a text-safe version of the primary, and an "r, g, b" triplet
 * for tinting shadows.
 */

const HEX = /^#?([0-9a-f]{6})$/i

export type Rgb = [number, number, number]

export function parseHex(hex: string): Rgb | null {
  const m = HEX.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function toHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two colours, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return null
  const la = luminance(ca)
  const lb = luminance(cb)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The primary colour darkened just enough to read as text on `background`
 * (default white). A primary that already reads is returned unchanged.
 */
export function readableInk(primary: string, background = '#ffffff', min = 4.5): string {
  const base = parseHex(primary)
  if (!base) return primary
  let mix = 0
  let out = base
  while (mix <= 1) {
    out = base.map((v) => v * (1 - mix)) as Rgb
    const ratio = contrastRatio(toHex(out), background)
    if (ratio !== null && ratio >= min) return toHex(out)
    mix += 0.05
  }
  return '#000000'
}

/**
 * The secondary colour if it stands out on the primary, otherwise white: for big
 * numbers and other text that sits ON the primary colour.
 */
export function accentOnPrimary(primary: string, secondary: string): string {
  const ratio = contrastRatio(secondary, primary)
  return ratio !== null && ratio >= MIN_ACCENT_CONTRAST ? secondary : '#ffffff'
}

/** Dark or white, whichever reads better on a surface painted in `bg`. */
export function readableOn(bg: string): string {
  const dark = '#0f172a'
  const withDark = contrastRatio(dark, bg) ?? 0
  const withWhite = contrastRatio('#ffffff', bg) ?? 0
  return withDark >= withWhite ? dark : '#ffffff'
}

/** "r, g, b" for use inside rgba(var(--school-primary-rgb), 0.2). */
export function rgbTriplet(hex: string): string | null {
  const c = parseHex(hex)
  return c ? c.join(', ') : null
}

/** Below this the secondary colour will not stand out on the primary (the school's blue and gold are about 2.9:1 and are fine). */
export const MIN_ACCENT_CONTRAST = 2.5
