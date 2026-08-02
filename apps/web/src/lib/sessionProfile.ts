import type { Session } from '@supabase/supabase-js'
import type { Profile } from '../types'

/**
 * Persisted auth store can briefly hold another user's profile row.
 * Never branch on role/navigation until the profile belongs to the active session user.
 */
export function sessionScopedProfile(session: Session | null, profile: Profile | null): Profile | null {
  const uid = session?.user?.id
  if (!uid || !profile || profile.id !== uid) return null
  return profile
}
