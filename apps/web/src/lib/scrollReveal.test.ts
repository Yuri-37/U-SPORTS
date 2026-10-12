import { describe, expect, it } from 'vitest'
import { countUpAt, revealDelayMs } from './scrollReveal'

describe('scroll reveal delay', () => {
  it('starts the first item at once', () => {
    expect(revealDelayMs(0)).toBe(0)
  })
  it('steps 100ms per item', () => {
    expect(revealDelayMs(3)).toBe(300)
  })
  it('never waits longer than the cap, so the last item lands within about 1.2s', () => {
    expect(revealDelayMs(50)).toBe(400)
    expect(revealDelayMs(50) + 800).toBeLessThanOrEqual(1200)
  })
})

describe('stat count-up', () => {
  it('runs from 0 to the target', () => {
    expect(countUpAt(0, 250)).toBe(0)
    expect(countUpAt(1, 250)).toBe(250)
  })
  it('eases out: well past halfway at half the time', () => {
    expect(countUpAt(0.5, 100)).toBeGreaterThan(80)
  })
  it('clamps out-of-range progress', () => {
    expect(countUpAt(-1, 9)).toBe(0)
    expect(countUpAt(3, 9)).toBe(9)
  })
})
