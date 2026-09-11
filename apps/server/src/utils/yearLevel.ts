/**
 * Year level is department-dependent: Senior High runs Grades 11-12, the
 * three college departments run 1st-4th year. Kept here (rather than inline
 * in each route) because both the single-athlete form and the bulk roster
 * importer have to enforce the identical rule -- the same reason
 * emailDomain.ts exists.
 *
 * apps/web/src/lib/validation/yearLevel.ts mirrors this for the dropdown and
 * client-side check; the server stays authoritative.
 *
 * The canonical stored form is the text people read -- "2nd Year", "Grade 11"
 * -- not a short code. The web tables, both profile pages and the mobile app
 * all print athletes.year_level as-is, and the mobile app can only change
 * with a new APK; storing "11" or "2nd" showed up on those screens raw. It is
 * also the form the existing college data already used, so the dropdown now
 * recognises what it loads (migration 072 converts the rest).
 */

export const SHS_DEPARTMENT = 'SHS'

export const COLLEGE_YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'] as const
export const SHS_YEAR_LEVELS = ['Grade 11', 'Grade 12'] as const

export function yearLevelsForDepartment(department: string): readonly string[] {
  return department === SHS_DEPARTMENT ? SHS_YEAR_LEVELS : COLLEGE_YEAR_LEVELS
}

/**
 * Accepts what a real spreadsheet actually contains -- "1", "1st", "1st Year",
 * "Grade 11", "G11", "11" -- and returns the canonical stored form, or null if
 * it isn't a valid level for that department. Importing a roster shouldn't
 * fail on formatting when the intent is unambiguous, but a 5th year in college
 * or a Grade 9 in SHS is a genuine data error and must be rejected.
 */
export function normalizeYearLevel(raw: string, department: string): string | null {
  const cleaned = raw.trim().toLowerCase()
  if (!cleaned) return null

  // First number found anywhere in the string ("Grade 11" -> 11, "4th Year" -> 4).
  const digits = cleaned.match(/\d+/)
  if (!digits) return null
  const n = Number(digits[0])

  if (department === SHS_DEPARTMENT) {
    return n === 11 || n === 12 ? `Grade ${n}` : null
  }
  return n >= 1 && n <= 4 ? COLLEGE_YEAR_LEVELS[n - 1] : null
}

/** Human-readable rule, reused verbatim in every error message. */
export function yearLevelErrorMessage(department: string): string {
  return department === SHS_DEPARTMENT
    ? 'Year level for SHS must be Grade 11 or 12.'
    : 'Year level for college must be 1st, 2nd, 3rd, or 4th year.'
}
