import supabase from './supabase'

/** Roughly a hundred years: Supabase Auth has no "banned forever", only a duration. */
const LOCKED_BAN = '876000h'

/**
 * Lock or unlock an account's access to the platform.
 *
 * Two layers, so neither alone is what keeps someone out:
 *  - profiles.deactivated_at is what the API checks on every request
 *    (middleware/auth.ts), so a token that is still valid stops working at once;
 *  - the Supabase Auth ban stops a new sign-in and a token refresh, so the
 *    person cannot get back in with the password.
 * Unlocking undoes both.
 */
export async function setAccountLocked(
  profileId: string,
  locked: boolean,
): Promise<{ error?: string }> {
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ deactivated_at: locked ? new Date().toISOString() : null })
    .eq('id', profileId)
  if (profileError) return { error: profileError.message }

  // A locked person must stop getting push notifications on their devices.
  if (locked) await supabase.from('push_tokens').delete().eq('profile_id', profileId)

  const { error: banError } = await supabase.auth.admin.updateUserById(profileId, {
    ban_duration: locked ? LOCKED_BAN : 'none',
  })
  if (banError) {
    // The API-side lock is already in place, so the account is shut either way.
    // On unlock a stuck ban would keep the person out, so that one is surfaced.
    console.warn('[accountLock] auth ban update failed:', banError.message)
    if (!locked) return { error: banError.message }
  }
  return {}
}
