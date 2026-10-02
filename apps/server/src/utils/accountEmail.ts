import supabase from './supabase'
import { ISSUED_PASSWORD_SCHEME, readablePassword, resetPassword } from './readablePassword'

/**
 * Whether new accounts ALSO get a "set your own password" email.
 *
 * On by default; set INVITE_EMAILS_ENABLED=false to switch it off. This used
 * to be opt-in because the old behaviour was all-or-nothing: with it on, an
 * account was made through Supabase's invite API, which creates it with NO
 * password -- so if the mail never arrived (a quarantined message, an
 * unconfigured SMTP, the built-in mailer's ~2/hour cap) the account existed
 * but nobody could sign in. That is why the flag had to stay off, and why
 * registration then sent nothing at all.
 *
 * Accounts are now always created WITH a password the staff member can hand
 * over (see the creators below), and the email is a best-effort extra whose
 * outcome is reported back rather than swallowed. A failed or filtered
 * message can therefore no longer lock anyone out, which is what makes it
 * safe to default on.
 *
 * Delivery still depends on dashboard settings that live outside this repo:
 * Auth -> SMTP (Resend, see supabase/SMTP.md) and Auth -> URL Configuration
 * (Supabase silently swaps in Site URL for a redirectTo that isn't
 * allow-listed -- the misconfiguration that once sent reset links to
 * localhost).
 */
export function inviteEmailsEnabled(): boolean {
  return process.env.INVITE_EMAILS_ENABLED !== 'false'
}

export type AccountCreationResult = {
  /** Always 'password': the account is created with a usable password. */
  mode: 'password'
  userId: string
  /** The password the account was created with -- the reliable way in. */
  password: string
  /** Whether a set-your-own-password email was accepted by the mail provider. */
  emailed: boolean
  /** Why no email went out, when one was attempted and failed. */
  emailError?: string
}

/** Short, human wording for the errors Supabase's mailer actually produces. */
function describeMailError(raw: string): string {
  if (/rate limit|too many|over_email_send_rate_limit/i.test(raw)) {
    return 'Too many emails were sent recently. Try again in about an hour.'
  }
  if (/not authorized|not allowed|only.*team/i.test(raw)) {
    return 'The mail provider is not set up to send to this address yet.'
  }
  return raw || 'The email could not be sent.'
}

/**
 * Sends the "set your own password" link to a freshly created account.
 *
 * Uses the recovery email -- the one flow already proven to reach inboxes
 * through the configured SMTP -- rather than an invite, because an invite
 * would also (re)create the account without a password. Never throws: a
 * message that fails to send must not fail account creation, so the outcome
 * comes back as data for the staff UI to show.
 */
async function sendSetPasswordEmail(
  email: string,
): Promise<{ emailed: boolean; emailError?: string }> {
  if (!inviteEmailsEnabled()) return { emailed: false }
  const redirectTo = process.env.WEB_URL
    ? `${process.env.WEB_URL.replace(/\/+$/, '')}/auth/reset-password`
    : undefined
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) return { emailed: false, emailError: describeMailError(error.message) }
    return { emailed: true }
  } catch (e: unknown) {
    return { emailed: false, emailError: describeMailError(e instanceof Error ? e.message : '') }
  }
}

/**
 * Creates the auth user for a new staff account. Used by POST
 * /admin/organizers and POST /admin/admins.
 *
 * The account always gets a password: the one the admin typed, or a readable
 * generated one ("Brave-Otter-372") when none was given. Either way it is
 * returned so the admin can read it out, independent of whether the email
 * below ever arrives.
 */
export async function createStaffAuthUser(params: {
  email: string
  password?: string
  role: string
  fullName: string
  department: string | null
}): Promise<AccountCreationResult> {
  const { email, role, fullName, department } = params
  // Keyed by a secret and by the clock, so every issued password is fresh and
  // not derivable from anything public (the old first-password formula was).
  const password = params.password ?? readablePassword(`staff:${email.toLowerCase()}:${Date.now()}`)

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
  return { mode: 'password', userId: data.user.id, password, ...(await sendSetPasswordEmail(email)) }
}

/**
 * Creates the auth user for a new athlete account, same shape as
 * createStaffAuthUser above but with athlete metadata
 * (student_id/course/year_level instead of a staff role). Used by both the
 * single-athlete form and the bulk importer (routes/students.ts) so there's
 * one code path instead of three.
 *
 * `sendEmail` is off for the bulk importer: mailing a whole roster at once
 * trips the provider's hourly limit and would leave most of a class with a
 * failed message. The import result lists every password instead, which is
 * what staff hand out anyway.
 */
export async function createAthleteAuthUser(params: {
  email: string
  password: string
  fullName: string
  studentId: string
  department: string
  course?: string
  yearLevel?: string
  sendEmail?: boolean
}): Promise<AccountCreationResult> {
  const { email, password, fullName, studentId, department, course, yearLevel, sendEmail } = params

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      student_id: studentId,
      department,
      course,
      year_level: yearLevel,
    },
  })
  if (error || !data?.user?.id) {
    throw new Error(error?.message ?? 'Could not create athlete account')
  }
  const mail = sendEmail ? await sendSetPasswordEmail(email) : { emailed: false }
  return { mode: 'password', userId: data.user.id, password, ...mail }
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

  // Readable words a staff member can read aloud without it being misheard --
  // "Brave-Otter-372", not "k7Fq2xPl". Keyed by the account id plus the
  // current time so every reset is a fresh password nobody off-server can
  // predict; it is shown once and not meant to be recomputed later (a lost
  // one is handled by resetting again).
  const tempPassword = resetPassword(params.profileId, Date.now())
  const { error } = await supabase.auth.admin.updateUserById(params.profileId, {
    password: tempPassword,
  })
  if (error) throw new Error(error.message)
  await supabase
    .from('profiles')
    .update({ issued_password_scheme: ISSUED_PASSWORD_SCHEME })
    .eq('id', params.profileId)
  return { mode: 'password', tempPassword }
}
