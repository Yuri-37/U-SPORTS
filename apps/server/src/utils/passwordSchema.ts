import { z } from 'zod'

/**
 * The single server-side password rule — every endpoint that accepts a
 * user-chosen or admin-set password validates against this. Mirrors
 * `passwordZ` in apps/web/src/lib/validation/forms.ts; the client copy exists
 * for fast feedback, this one is the actual enforcement point.
 */
export const passwordZ = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .refine((p) => /[A-Za-z]/.test(p), { message: 'Password must contain at least one letter' })
  .refine((p) => /[0-9]/.test(p), { message: 'Password must contain at least one number' })
  .refine((p) => p.trim().length > 0, { message: 'Password cannot be only spaces' })
