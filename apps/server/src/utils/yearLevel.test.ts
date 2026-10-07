import { describe, expect, it } from 'vitest'
import {
  nextYearLevel,
  normalizeYearLevel,
  yearLevelErrorMessage,
  yearLevelsForDepartment,
} from './yearLevel'

describe('promotion to the next year level', () => {
  it('moves each college year up by one', () => {
    expect(nextYearLevel('1st Year', 'SBMA')).toBe('2nd Year')
    expect(nextYearLevel('2nd Year', 'SECA')).toBe('3rd Year')
    expect(nextYearLevel('3rd Year', 'SASE')).toBe('4th Year')
  })

  it('moves Grade 11 to Grade 12 for senior high', () => {
    expect(nextYearLevel('Grade 11', 'SHS')).toBe('Grade 12')
  })

  it('has no next level for the last year of each programme', () => {
    expect(nextYearLevel('4th Year', 'SBMA')).toBeNull()
    expect(nextYearLevel('Grade 12', 'SHS')).toBeNull()
  })

  it('leaves unset or unrecognisable values alone', () => {
    expect(nextYearLevel('', 'SBMA')).toBeNull()
    expect(nextYearLevel(null, 'SBMA')).toBeNull()
    expect(nextYearLevel('freshman', 'SBMA')).toBeNull()
    // a college level on an SHS athlete is not a valid SHS level, so no guess is made
    expect(nextYearLevel('2nd Year', 'SHS')).toBeNull()
  })

  it('understands the loose spreadsheet forms too', () => {
    expect(nextYearLevel('1', 'SBMA')).toBe('2nd Year')
    expect(nextYearLevel('G11', 'SHS')).toBe('Grade 12')
  })
})

describe('year levels', () => {
  it('accepts the many ways a spreadsheet writes a college year', () => {
    for (const raw of ['1', '1st', '1st Year', ' 1ST YEAR ']) {
      expect(normalizeYearLevel(raw, 'SBMA')).toBe('1st Year')
    }
    expect(normalizeYearLevel('4th year', 'SECA')).toBe('4th Year')
  })

  it('accepts Grade 11/12 for senior high only', () => {
    expect(normalizeYearLevel('Grade 11', 'SHS')).toBe('Grade 11')
    expect(normalizeYearLevel('G12', 'SHS')).toBe('Grade 12')
    expect(normalizeYearLevel('12', 'SHS')).toBe('Grade 12')
    expect(normalizeYearLevel('Grade 11', 'SBMA')).toBeNull()
  })

  it('rejects levels that do not exist', () => {
    expect(normalizeYearLevel('5th Year', 'SBMA')).toBeNull()
    expect(normalizeYearLevel('Grade 9', 'SHS')).toBeNull()
    expect(normalizeYearLevel('', 'SHS')).toBeNull()
    expect(normalizeYearLevel('freshman', 'SBMA')).toBeNull()
  })

  it('lists the valid levels per department and explains the rule', () => {
    expect(yearLevelsForDepartment('SHS')).toEqual(['Grade 11', 'Grade 12'])
    expect(yearLevelsForDepartment('SASE')).toHaveLength(4)
    expect(yearLevelErrorMessage('SHS')).toMatch(/Grade 11 or 12/)
    expect(yearLevelErrorMessage('SECA')).toMatch(/1st, 2nd, 3rd, or 4th/)
  })
})
