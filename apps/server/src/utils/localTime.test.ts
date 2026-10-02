import { describe, expect, it } from 'vitest'
import { localDatetimeStringToIso } from './localTime'

describe('announcement date handling (Manila time)', () => {
  it('reads a zone-less picker value as Manila time, not server time', () => {
    // 2:00 PM typed in Manila is 06:00 UTC -- not 14:00 UTC (the old 8-hour bug).
    expect(localDatetimeStringToIso('2026-10-02T14:00')).toBe('2026-10-02T06:00:00.000Z')
  })

  it('keeps an explicit UTC instant exactly as given', () => {
    expect(localDatetimeStringToIso('2026-10-02T06:00:00.000Z')).toBe('2026-10-02T06:00:00.000Z')
  })

  it('honours an explicit offset', () => {
    expect(localDatetimeStringToIso('2026-10-02T14:00:00+08:00')).toBe('2026-10-02T06:00:00.000Z')
    expect(localDatetimeStringToIso('2026-10-02T14:00:00-05:00')).toBe('2026-10-02T19:00:00.000Z')
  })

  it('gives the same instant no matter which timezone the server runs in', () => {
    const before = process.env.TZ
    try {
      process.env.TZ = 'America/Los_Angeles'
      expect(localDatetimeStringToIso('2026-10-02T14:00')).toBe('2026-10-02T06:00:00.000Z')
      process.env.TZ = 'UTC'
      expect(localDatetimeStringToIso('2026-10-02T14:00')).toBe('2026-10-02T06:00:00.000Z')
    } finally {
      process.env.TZ = before
    }
  })

  it('rejects nonsense', () => {
    expect(() => localDatetimeStringToIso('not a date')).toThrow('Invalid date and time')
  })
})
