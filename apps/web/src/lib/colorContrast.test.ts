import { describe, expect, it } from 'vitest'
import { MIN_ACCENT_CONTRAST, contrastRatio, readableInk, rgbTriplet } from './colorContrast'

describe('brand colour helpers', () => {
  it('measures contrast like WCAG', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatio('nope', '#ffffff')).toBeNull()
  })

  it('flags the colours that do not stand out on each other', () => {
    // The two colours saved at the time this was written.
    expect(contrastRatio('#82754f', '#7494c3')!).toBeLessThan(MIN_ACCENT_CONTRAST)
    // The school's blue with its gold does.
    expect(contrastRatio('#F4C430', '#0066FF')!).toBeGreaterThan(MIN_ACCENT_CONTRAST)
  })

  it('darkens a light primary until it reads as text on white', () => {
    const ink = readableInk('#7494c3')
    expect(contrastRatio(ink, '#ffffff')!).toBeGreaterThanOrEqual(4.5)
    expect(readableInk('#002d62')).toBe('#002d62')
  })

  it('gives an r, g, b triplet for shadows', () => {
    expect(rgbTriplet('#002d62')).toBe('0, 45, 98')
    expect(rgbTriplet('x')).toBeNull()
  })
})

import { accentOnPrimary, readableOn } from './colorContrast'

describe('colours for text on the brand colours', () => {
  it('keeps the accent when it stands out and falls back to white when it does not', () => {
    expect(accentOnPrimary('#002d62', '#ffd700')).toBe('#ffd700')
    expect(accentOnPrimary('#7494c3', '#82754f')).toBe('#ffffff')
  })
  it('picks dark or white text for a surface', () => {
    expect(readableOn('#ffd700')).toBe('#0f172a')
    expect(readableOn('#002d62')).toBe('#ffffff')
  })
})
