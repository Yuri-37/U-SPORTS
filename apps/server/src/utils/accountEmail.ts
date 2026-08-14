import { randomBytes } from 'crypto'
import supabase from './supabase'

/**
 * Whether outbound account email (invites via
 * supabase.auth.admin.inviteUserByEmail, and admin-triggered password
 * resets via supabase.auth.resetPasswordForEmail) can be relied on, as
 * opposed to the admin setting/relaying a password by hand. OFF by default
 * and must stay that way until BOTH of these are done in the Supabase
 * dashboard (verified as unconfigured as of this writing):
 *
 *   1. Auth -> SMTP Settings: point at a real provider (Resend/Brevo/etc,
 *      see supabase/SMTP.md). The built-in mailer caps at ~2 emails/hour and
 *      is documented as development-only -- fine for occasional password
 *      resets, not for onboarding a roster of staff.
 *   2. Auth -> URL Configuration: add the accept-invite and reset-password
 *      redirect URLs to the allow-list. Supabase silently substitutes Site
 *      URL for any redirectTo that isn't allow-listed -- the same
 *      misconfiguration that sends password-reset links to localhost today.
 *
 * Flipping this on without both of those means invites and reset emails
 * silently fail to deliver with no working fallback, which is worse than
 * the current password-and-share flow they would replace.
 */
export function inviteEmailsEnabled(): boolean {
  return process.env.INVITE_EMAILS_ENABLED === 'true'
}

export type StaffAccountResult =
  | { mode: 'invited'; userId: string }
  | { mode: 'password'; userId: string }

/**
 * Creates the auth user for a new staff account via whichever path
 * inviteEmailsEnabled() selects, so callers (POST /admin/organizers,
 * POST /admin/admins) don't need to branch themselves. Both paths converge
 * on the same result shape.
 */
export async function createStaffAuthUser(params: {
  email: string
  password?: string
  role: string
  fullName: string
  department: string | null
}): Promise<StaffAccountResult> {
  const { email, password, role, fullName, department } = params

  if (inviteEmailsEnabled()) {
    const redirectTo = process.env.WEB_URL
      ? `${process.env.WEB_URL.replace(/\/+$/, '')}/auth/accept-invite`
      : undefined
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, department },
      redirectTo,
    })
    if (error || !data?.user?.id) {
      throw new Error(error?.message ?? 'Could not send invitation email')
    }
    // app_metadata.role isn't reliably settable via inviteUserByEmail's
    // options across supabase-js versions -- set it explicitly right after,
    // matching how createUser sets it in the password path below.
    await supabase.auth.admin.updateUserById(data.user.id, { app_metadata: { role } })
    return { mode: 'invited', userId: data.user.id }
  }

  if (!password) {
    throw new Error('Password is required while invite emails are disabled (INVITE_EMAILS_ENABLED)')
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: fullName, department },
  })
  if (error || !data?.user?.id) {
    throw new Error(error?.message ?? 'Could not create staff account')
  }
  return { mode: 'password', userId: data.user.id }
}

export type PasswordResetResult =
  | { mode: 'email' }
  | { mode: 'password'; tempPassword: string }

/**
 * The admin-triggered "reset this account's password" action, shared by
 * staff (routes/admin.ts) and athletes (routes/athletes.ts) so there's one
 * flow instead of two. `mode` is explicit rather than always following
 * inviteEmailsEnabled() -- the self-service /auth/forgot-password page
 * already lets anyone request a reset email regardless of that flag, so an
 * admin should have the same choice, just with 'password' (today's only
 * reliable path) as the default while it's off. See inviteEmailsEnabled()
 * above for why email delivery can't be assumed yet.
 */
export async function resetAccountPassword(params: {
  profileId: string
  email: string
  mode: 'email' | 'password'
}): Promise<PasswordResetResult> {
  if (params.mode === 'email') {
    const redirectTo = process.env.WEB_URL
      ? `${process.env.WEB_URL.replace(/\/+$/, '')}/auth/reset-password`
      : undefined
    const { error } = await supabase.auth.resetPasswordForEmail(params.email, { redirectTo })
    if (error) throw new Error(error.message)
    return { mode: 'email' }
  }

  const tempPassword = randomBytes(9).toString('base64url')
  const { error } = await supabase.auth.admin.updateUserById(params.profileId, {
    password: tempPassword,
  })
  if (error) throw new Error(error.message)
  return { mode: 'password', tempPassword }
}
