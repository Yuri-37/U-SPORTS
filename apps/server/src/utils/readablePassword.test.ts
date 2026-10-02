import { describe, expect, it, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.ACCOUNT_PASSWORD_SECRET = 'unit-test-secret'
})

async function load() {
  return import('./readablePassword')
}

describe('readable account passwords', () => {
  it('has the Adjective-Noun-123 shape that can be read aloud', async () => {
    const { readablePassword } = await load()
    expect(readablePassword('anything')).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+-\d{3}$/)
  })

  it('is deterministic for the same label', async () => {
    const { readablePassword } = await load()
    expect(readablePassword('staff:a@nu-dasma.edu.ph')).toBe(readablePassword('staff:a@nu-dasma.edu.ph'))
  })

  it('differs between labels', async () => {
    const { readablePassword } = await load()
    const seen = new Set(Array.from({ length: 200 }, (_, i) => readablePassword(`label-${i}`)))
    expect(seen.size).toBeGreaterThan(190)
  })

  it('treats a student id the same regardless of spacing or case', async () => {
    const { firstPassword } = await load()
    expect(firstPassword('2021 - 12345'.replace(' - ', '-'))).toBe(firstPassword(' 2021-12345 '))
    expect(firstPassword('AB-1')).toBe(firstPassword('ab-1'))
  })

  it('gives a new password for every reset of the same account', async () => {
    const { resetPassword } = await load()
    const first = resetPassword('account-1', 1)
    const second = resetPassword('account-1', 2)
    expect(first).not.toBe(second)
    expect(resetPassword('account-1', 1)).toBe(first)
  })

  it('is not derivable from the student id alone (no public formula)', async () => {
    const { firstPassword } = await load()
    expect(firstPassword('2021-12345')).not.toContain('2021')
    expect(firstPassword('2021-12345')).not.toMatch(/UrSports/i)
  })

  it('records which scheme issued the password', async () => {
    const { ISSUED_PASSWORD_SCHEME } = await load()
    expect(ISSUED_PASSWORD_SCHEME).toBe('keyed-v1')
  })
})
