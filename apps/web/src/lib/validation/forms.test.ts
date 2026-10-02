import { describe, expect, it } from 'vitest'
import { passwordZ, staffEmailZ, studentEmailZ } from './forms'
import { normalizeYearLevel, yearLevelsForDepartment } from './yearLevel'

describe('school email rules', () => {
  it('only accepts staff addresses on the staff domain', () => {
    expect(staffEmailZ.safeParse('juan@nu-dasma.edu.ph').success).toBe(true)
    expect(staffEmailZ.safeParse('juan@students.nu-dasma.edu.ph').success).toBe(false)
    expect(staffEmailZ.safeParse('juan@gmail.com').success).toBe(false)
  })

  it('only accepts student addresses on the student domain', () => {
    expect(studentEmailZ.safeParse('maria@students.nu-dasma.edu.ph').success).toBe(true)
    expect(studentEmailZ.safeParse('maria@nu-dasma.edu.ph').success).toBe(false)
  })

  it('ignores letter case and surrounding spaces', () => {
    expect(staffEmailZ.safeParse('  Juan@NU-DASMA.edu.ph ').success).toBe(true)
  })
})

describe('chosen password rule', () => {
  it('needs 8+ characters with a letter and a number', () => {
    expect(passwordZ.safeParse('Brave-Otter-372').success).toBe(true)
    expect(passwordZ.safeParse('short1').success).toBe(false)
    expect(passwordZ.safeParse('onlyletters').success).toBe(false)
    expect(passwordZ.safeParse('12345678').success).toBe(false)
  })
})

describe('year level options (web copy)', () => {
  it('matches the server rules', () => {
    expect(yearLevelsForDepartment('SHS')).toEqual(['Grade 11', 'Grade 12'])
    expect(normalizeYearLevel('2', 'SECA')).toBe('2nd Year')
    expect(normalizeYearLevel('5', 'SECA')).toBeNull()
  })
})
