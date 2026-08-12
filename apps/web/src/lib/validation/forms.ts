import { z } from 'zod'

const emailZ = z.string().trim().min(1, 'Email is required').email('Enter a valid email')

export const passwordZ = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')

export const loginFormSchema = z.object({
  email: emailZ,
  password: z.string().min(1, 'Password is required').max(128),
})

export const STAFF_ROLES = ['Organizer', 'Coach'] as const
export const DEPARTMENTS = ['SBMA', 'SECA', 'SASE', 'SHS'] as const

export const createOrganizerFormSchema = z
  .object({
    full_name: z.string().trim().min(1, 'Name is required').max(120),
    email: emailZ,
    password: passwordZ,
    confirmPassword: z.string(),
    role: z.enum(STAFF_ROLES),
    // Department only means anything for Coach (it's what scopes the
    // one-coach-per-sport-per-department rule) — Organizers aren't
    // department-scoped anywhere, so it's optional/absent for them.
    department: z.enum(DEPARTMENTS).nullable().optional(),
    assigned_sports: z.array(z.string()).min(1, 'Assign at least one sport'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((d) => d.role !== 'Coach' || d.assigned_sports.length === 1, {
    message: 'Coaches must be assigned exactly one sport',
    path: ['assigned_sports'],
  })
  .refine((d) => d.role !== 'Coach' || Boolean(d.department), {
    message: 'Department is required for coaches',
    path: ['department'],
  })
