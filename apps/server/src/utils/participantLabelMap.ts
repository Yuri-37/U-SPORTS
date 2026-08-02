import supabase from './supabase'

/** Resolve team / athlete participant UUIDs to display names (bulk). */
export async function resolveParticipantLabelMap(ids: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))]
  const map: Record<string, string> = {}
  if (uniq.length === 0) return map

  const { data: teamRows } = await supabase.from('teams').select('id,name').in('id', uniq)
  for (const t of teamRows ?? []) map[t.id] = t.name

  const missing = uniq.filter((id) => !map[id])
  if (missing.length === 0) return map

  const { data: athletes } = await supabase
    .from('athletes')
    .select('id, profile:profiles!athletes_profile_id_fkey(full_name)')
    .in('id', missing)

  for (const row of athletes ?? []) {
    const r = row as { id: string; profile?: { full_name?: string } | null | { full_name?: string }[] }
    const prof = Array.isArray(r.profile) ? r.profile[0] : r.profile
    const n = prof?.full_name?.trim()
    if (n) map[r.id] = n
  }

  return map
}
