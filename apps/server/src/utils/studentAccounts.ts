// The school's real student email domain — live Outlook/Microsoft 365
// mailboxes, not a placeholder. Every athlete account now requires a real
// address (accounts are delivered by email), so there is deliberately no
// generated-address fallback: a synthesised student-ID address is not a
// mailbox anyone can actually receive an invite at.
export const STUDENT_EMAIL_DOMAIN = 'students.nu-dasma.edu.ph'

/**
 * Deterministic, readable first password, used only while invite emails are
 * disabled (an admin reads it out or relays it). Derived from the student ID
 * rather than random characters so it can be dictated over a desk without
 * being misheard, and regenerated identically if it's lost.
 */
export function generatedPassword(studentId: string): string {
  return `UrSports-${studentId.replace(/\s+/g, '')}-2026!`
}
