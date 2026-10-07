import { z } from 'zod'
import { STUDENT_EMAIL_DOMAIN } from './studentAccounts'

/**
 * The school's real staff mailbox domain — live Microsoft 365 addresses,
 * same family as STUDENT_EMAIL_DOMAIN but not a sub-path of it (a coach or
 * organizer's address is never under students.*, so a plain `.endsWith`
 * suffix check can't accidentally let a student address through the staff
 * check or vice versa).
 */
export const STAFF_EMAIL_DOMAIN = 'nu-dasma.edu.ph'

/**
 * A short list of addresses let through the staff-domain check anyway, for
 * testing the staff account-creation flow (and its "set your password"
 * email) against a real inbox when no @nu-dasma.edu.ph mailbox is available.
 * Comma-separated in STAFF_EMAIL_TEST_ALLOWLIST; empty by default, so
 * production stays locked to the real domain unless this is explicitly set.
 */
function isAllowlistedStaffEmail(email: string): boolean {
  return (process.env.STAFF_EMAIL_TEST_ALLOWLIST ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email)
}

function domainRestrictedEmailZ(domain: string, roleLabel: string, allowException?: (email: string) => boolean) {
  return z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email')
    .refine((email) => email.endsWith(`@${domain}`) || (allowException?.(email) ?? false), {
      message: `${roleLabel} accounts must use a @${domain} email address`,
    })
}

/** Required for every server-side flow that creates or invites a staff account (Organizer, Coach, Admin). */
export const staffEmailZ = domainRestrictedEmailZ(STAFF_EMAIL_DOMAIN, 'Staff', isAllowlistedStaffEmail)

/** For athlete accounts. Callers that treat email as optional (falls back to a generated address) chain `.optional()` themselves. */
export const studentEmailZ = domainRestrictedEmailZ(STUDENT_EMAIL_DOMAIN, 'Student')
