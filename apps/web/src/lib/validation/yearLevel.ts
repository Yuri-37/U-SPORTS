/**
 * Mirrors apps/server/src/utils/yearLevel.ts so the Add-athlete dropdown
 * offers exactly the levels the server will accept. The server stays
 * authoritative -- this is fast feedback, not the enforcement point.
 *
 * Values are the canonical stored form, which is also the display text
 * ("2nd Year", "Grade 11") -- see the server file for why.
 */

export const SHS_DEPARTMENT = 'SHS'

export const COLLEGE_YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'] as const
export const SHS_YEAR_LEVELS = ['Grade 11', 'Grade 12'] as const

export function yearLevelsForDepartment(department: string): readonly string[] {
  return department === SHS_DEPARTMENT ? SHS_YEAR_LEVELS : COLLEGE_YEAR_LEVELS
}

/** Dropdown options, including the "not set" entry -- year level is optional. */
export function yearLevelOptions(department: string): { value: string; label: string }[] {
  return [
    { value: '', label: 'Not set' },
    ...yearLevelsForDepartment(department).map((v) => ({ value: v, label: v })),
  ]
}

/** Same parsing rule as the server's normalizeYearLevel. */
export function normalizeYearLevel(raw: string, department: string): string | null {
  const digits = raw.trim().match(/\d+/)
  if (!digits) return null
  const n = Number(digits[0])
  if (department === SHS_DEPARTMENT) return n === 11 || n === 12 ? `Grade ${n}` : null
  return n >= 1 && n <= 4 ? COLLEGE_YEAR_LEVELS[n - 1] : null
}

/**
 * The dropdown value for an athlete being edited. Stored values predate the
 * current format: college rows may read "2nd" as well as "2nd Year", and
 * Senior High rows were stored as "1st Year" / "2nd Year" -- the old
 * convention for Grade 11 / 12 (see the seed and fixShsYearLevels scripts).
 * Loading those raw left the dropdown on "Not set" for athletes who had a
 * level, and the department-change rule then wiped it on save.
 *
 * Returns '' for no level, the canonical value when it maps, and null only
 * for a value that cannot be mapped -- which the form flags instead of
 * silently dropping.
 */
export function yearLevelForEdit(
  stored: string | null | undefined,
  department: string,
): string | null {
  const raw = (stored ?? '').trim()
  if (!raw) return ''
  const canonical = normalizeYearLevel(raw, department)
  if (canonical) return canonical
  if (department === SHS_DEPARTMENT) {
    const legacy = raw.match(/^([12])(st|nd)?\s*year$/i)
    if (legacy) return legacy[1] === '1' ? 'Grade 11' : 'Grade 12'
  }
  return null
}
