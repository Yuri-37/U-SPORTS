import { supabase } from './supabase'
import type { Season } from '../types'

/** Draft + active seasons for forms (Super Admin creates seasons as draft until activated). */
export async function fetchSeasonsForEventForms(): Promise<Season[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .in('status', ['active', 'draft'])
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const list = (data ?? []) as Season[]
  return [...list].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1
    if (b.status === 'active' && a.status !== 'active') return 1
    return 0
  })
}
