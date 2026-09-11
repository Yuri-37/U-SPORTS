// The school's real student email domain — live Outlook/Microsoft 365
// mailboxes, not a placeholder. Every athlete account now requires a real
// address (accounts are delivered by email), so there is deliberately no
// generated-address fallback: a synthesised student-ID address is not a
// mailbox anyone can actually receive an invite at.
export const STUDENT_EMAIL_DOMAIN = 'students.nu-dasma.edu.ph'

// The first password is still readable and reproducible from the student ID,
// but no longer computable off-server: readablePassword.ts keys it with a
// server-only secret. The old `UrSports-<studentid>-2026!` formula was
// public (this repo) and the student ID is effectively public, so anyone
// could sign in as any athlete who hadn't changed it. See firstPassword().
export { firstPassword as generatedPassword } from './readablePassword'
