import supabase from './supabase'
import { sendPushToProfiles } from './sendPushNotification'

/** Batch insert inbox rows (service_role bypasses RLS), then best-effort push to registered devices. */
export async function insertNotificationsForProfiles(
  recipientIds: string[],
  payload: { type: string; title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  const unique = [...new Set(recipientIds.filter(Boolean))]
  if (unique.length === 0) return
  const rows = unique.map((recipient_id) => ({
    recipient_id,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }))
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from('notifications').insert(rows.slice(i, i + 100))
    if (error) throw new Error(error.message)
  }

  // Best-effort — a push failure should never fail the request that got us here.
  try {
    const data: Record<string, string> = { type: payload.type }
    for (const [k, v] of Object.entries(payload.data ?? {})) data[k] = String(v)
    await sendPushToProfiles(unique, { title: payload.title, body: payload.body, data })
  } catch (err) {
    console.warn('[push] send failed:', (err as Error).message)
  }
}

/** All athlete profile IDs rostered on a team. */
export async function profileIdsForTeamRoster(teamId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('athlete:athletes(profile_id)')
    .eq('team_id', teamId)
  if (error) throw new Error(error.message)
  const ids = new Set<string>()
  for (const row of data ?? []) {
    const profileId = (row as { athlete?: { profile_id?: string | null } | null }).athlete
      ?.profile_id
    if (profileId) ids.add(profileId)
  }
  return [...ids]
}

/**
 * Staff notification sites deal in `organizers.id` (season_staff's own
 * foreign key — it covers both Organizer and Coach roles with one column),
 * not `profiles.id` directly. This resolves the one hop between them so
 * insertNotificationsForProfiles can be called the same way as everywhere
 * else. Nothing about that function is athlete-specific despite the file
 * name -- it just takes profile IDs.
 */
export async function profileIdsForOrganizerIds(organizerIds: string[]): Promise<string[]> {
  const unique = [...new Set(organizerIds.filter(Boolean))]
  if (unique.length === 0) return []
  const { data, error } = await supabase
    .from('organizers')
    .select('profile_id')
    .in('id', unique)
  if (error) throw new Error(error.message)
  return [...new Set((data ?? []).map((r) => r.profile_id as string).filter(Boolean))]
}
