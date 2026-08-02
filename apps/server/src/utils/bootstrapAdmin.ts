import supabase from './supabase'

/**
 * Default Super Admin, created on first boot when no Admin exists.
 *
 * Replaces the Setup Wizard's account step: the platform is usable the moment
 * it is deployed. Override per deployment with INITIAL_ADMIN_EMAIL /
 * INITIAL_ADMIN_PASSWORD so the shipped credentials are never the live ones.
 */
const DEFAULT_ADMIN_EMAIL = 'admin@nu-dasma.edu.ph'
const DEFAULT_ADMIN_PASSWORD = 'Admin@12345'
const DEFAULT_ADMIN_NAME = 'Super Admin'

/**
 * Idempotent: creates the first Admin only when the platform has none. Safe to
 * run on every server start, and a no-op once a real admin exists (including
 * after the default one is renamed, replaced, or its password changed).
 */
export async function bootstrapDefaultAdmin(): Promise<void> {
  const { data: existing, error: lookupError } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'Admin')
    .limit(1)

  if (lookupError) {
    console.error('[bootstrap] Could not check for an existing admin:', lookupError.message)
    return
  }
  if (existing && existing.length > 0) return

  const email = (process.env.INITIAL_ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL).toLowerCase()
  const password = process.env.INITIAL_ADMIN_PASSWORD?.trim() || DEFAULT_ADMIN_PASSWORD
  const full_name = process.env.INITIAL_ADMIN_NAME?.trim() || DEFAULT_ADMIN_NAME
  const usingDefaults = !process.env.INITIAL_ADMIN_PASSWORD?.trim()

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'Admin' },
    user_metadata: { full_name },
  })

  // Another instance may have won the race, or the auth user may already exist
  // from a previous run whose profile write failed — fall back to that user.
  let userId = authData?.user?.id
  if (authError || !userId) {
    const msg = authError?.message ?? 'unknown error'
    if (!/already registered|already exists/i.test(msg)) {
      console.error('[bootstrap] Could not create the default admin account:', msg)
      return
    }
    const { data: list } = await supabase.auth.admin.listUsers()
    userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id
    if (!userId) {
      console.error('[bootstrap] Admin email is taken but the user could not be found:', email)
      return
    }
  }

  // handle_new_user() creates the profile row with a NULL role; promote it.
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: userId, email, full_name, role: 'Admin' })

  if (profileError) {
    console.error('[bootstrap] Could not grant the Admin role:', profileError.message)
    return
  }

  console.log(`[bootstrap] Created the default Super Admin account: ${email}`)
  if (usingDefaults) {
    console.warn(
      '[bootstrap] This account uses the built-in default password. Change it after signing in, ' +
        'or set INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD before first boot.',
    )
  }
}
