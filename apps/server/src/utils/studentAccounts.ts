// The school's real student email domain — live Outlook/Microsoft 365
// mailboxes, not a placeholder. Used only when no email is supplied; a
// given email is always used as-is instead. Shared by the single-athlete
// form (routes/athletes.ts) and the bulk importer (routes/students.ts) so
// generated addresses/passwords can't drift between the two paths.
export const STUDENT_EMAIL_DOMAIN = 'students.nu-dasma.edu.ph'

export function generatedEmail(studentId: string): string {
  return `${studentId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')}@${STUDENT_EMAIL_DOMAIN}`
}

export function generatedPassword(studentId: string): string {
  return `UrSports-${studentId.replace(/\s+/g, '')}-2026!`
}
