import { supabase } from './supabase'
import type { Season } from '../types'

/** Draft + active seasons for forms (Super Admin creates seasons as draft until activated).
 *  Embeds season_sports so Event/Team forms can filter their sport dropdown to
 *  what this season actually carries, rather than offering every sport and
 *  failing later with "No more teams available" for a season/sport mismatch. */
export async function fetchSeasonsForEventForms(): Promise<Season[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*, season_sports(sport)')
    .in('status', ['active', 'draft'])
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const list = ((data ?? []) as Array<Season & { season_sports?: { sport: string }[] }>).map(
    (s) => ({ ...s, sports: (s.season_sports ?? []).map((r) => r.sport) }),
  )
  return [...list].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1
    if (b.status === 'active' && a.status !== 'active') return 1
    return 0
  })
}
