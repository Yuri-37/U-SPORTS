import supabase from './supabase'

/** Batch insert inbox rows (service_role bypasses RLS). */
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
    const profileId = (row as { athlete?: { profile_id?: string | null } | null }).athlete?.profile_id
    if (profileId) ids.add(profileId)
  }
  return [...ids]
}
