import { describe, expect, it } from 'vitest'
import { revealDelayMs } from './scrollReveal'

describe('scroll reveal delay', () => {
  it('starts the first item at once', () => {
    expect(revealDelayMs(0, 'card')).toBe(0)
    expect(revealDelayMs(0, 'row')).toBe(0)
  })
  it('steps cards by 40ms and rows by 20ms', () => {
    expect(revealDelayMs(3, 'card')).toBe(120)
    expect(revealDelayMs(3, 'row')).toBe(60)
  })
  it('never waits longer than the cap', () => {
    expect(revealDelayMs(50, 'card')).toBe(200)
    expect(revealDelayMs(50, 'row')).toBe(120)
  })
})
