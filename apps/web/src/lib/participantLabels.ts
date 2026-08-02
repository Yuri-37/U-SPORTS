import { supabase } from './supabase'

/** Collect team/athlete ids shown on bracket slots */
export function collectBracketParticipantIds(
  brackets: { participant_a_id?: string | null; participant_b_id?: string | null }[]
): string[] {
  const s = new Set<string>()
  for (const b of brackets) {
    if (b.participant_a_id) s.add(b.participant_a_id)
    if (b.participant_b_id) s.add(b.participant_b_id)
  }
  return [...s]
}

/**
 * Resolve UUIDs to display names: teams first, then athletes (profile full_name).
 */
export async function fetchParticipantLabels(ids: string[]): Promise<Record<string, string>> {
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
    const r = row as { id: string; profile?: { full_name?: string } | null }
    const n = r.profile?.full_name?.trim()
    if (n) map[r.id] = n
  }

  return map
}
