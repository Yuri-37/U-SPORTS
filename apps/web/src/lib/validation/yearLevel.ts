/**
 * Mirrors apps/server/src/utils/yearLevel.ts so the Add-athlete dropdown
 * offers exactly the levels the server will accept. The server stays
 * authoritative -- this is fast feedback, not the enforcement point.
 */

export const SHS_DEPARTMENT = 'SHS'

export const COLLEGE_YEAR_LEVELS = ['1st', '2nd', '3rd', '4th'] as const
export const SHS_YEAR_LEVELS = ['11', '12'] as const

export function yearLevelsForDepartment(department: string): readonly string[] {
  return department === SHS_DEPARTMENT ? SHS_YEAR_LEVELS : COLLEGE_YEAR_LEVELS
}

/** Dropdown options, including the "not set" entry -- year level is optional. */
export function yearLevelOptions(department: string): { value: string; label: string }[] {
  const isShs = department === SHS_DEPARTMENT
  return [
    { value: '', label: 'Not set' },
    ...yearLevelsForDepartment(department).map((v) => ({
      value: v,
      label: isShs ? `Grade ${v}` : `${v} Year`,
    })),
  ]
}
