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

function domainRestrictedEmailZ(domain: string, roleLabel: string) {
  return z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email')
    .refine((email) => email.endsWith(`@${domain}`), {
      message: `${roleLabel} accounts must use a @${domain} email address`,
    })
}

/** Required for every server-side flow that creates or invites a staff account (Organizer, Coach, Admin). */
export const staffEmailZ = domainRestrictedEmailZ(STAFF_EMAIL_DOMAIN, 'Staff')

/** For athlete accounts. Callers that treat email as optional (falls back to a generated address) chain `.optional()` themselves. */
export const studentEmailZ = domainRestrictedEmailZ(STUDENT_EMAIL_DOMAIN, 'Student')
