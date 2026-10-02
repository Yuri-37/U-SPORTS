import { describe, expect, it } from 'vitest'
import { normalizeYearLevel, yearLevelErrorMessage, yearLevelsForDepartment } from './yearLevel'

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
