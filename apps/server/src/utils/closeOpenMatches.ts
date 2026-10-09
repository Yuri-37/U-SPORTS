import supabase from './supabase'

/**
 * Cancel every live or scheduled match of an event and free its scoring and
 * clock locks. Used when an event is settled together with its season. Returns
 * the ids that were closed.
 */
export async function closeOpenMatches(eventId: string): Promise<string[]> {
  const { data } = await supabase
    .from('matches')
    .select('id')
    .eq('event_id', eventId)
    .in('status', ['scheduled', 'live'])
  const ids = (data ?? []).map((m) => m.id as string)
  if (ids.length === 0) return []
  const { error } = await supabase
    .from('matches')
    .update({ status: 'cancelled', scoring_locked_by: null, clock_locked_by: null })
    .in('id', ids)
  if (error) {
    console.error('[closeOpenMatches] failed:', error.message)
    return []
  }
  return ids
}
