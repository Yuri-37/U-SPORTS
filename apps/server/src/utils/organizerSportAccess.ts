import type { Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import supabase from './supabase'

const FALLBACK_SPORTS = ['basketball', 'volleyball', 'table-tennis'] as const
export type AppSport = (typeof FALLBACK_SPORTS)[number]

export async function fetchActiveSportSlugs(): Promise<AppSport[]> {
  const { data, error } = await supabase.from('sports_config').select('slug').eq('is_active', true)
  if (error || !data?.length) {
    return [...FALLBACK_SPORTS]
  }
  const slugs = data
    .map((r) => r.slug as string)
    .filter((s): s is AppSport => (FALLBACK_SPORTS as readonly string[]).includes(s))
  return slugs.length > 0 ? slugs : [...FALLBACK_SPORTS]
}

export function organizerCoversAllActiveSports(assigned: string[] | null | undefined, active: AppSport[]): boolean {
  const set = new Set(assigned ?? [])
  return active.every((s) => set.has(s))
}

export function organizerMayConfigureSport(
  role: string | undefined,
  assigned: string[] | null | undefined,
  active: AppSport[],
  sport: string
): boolean {
  if (role === 'Admin') return true
  const safeAssigned = assigned ?? []
  if (organizerCoversAllActiveSports(safeAssigned, active)) return true
  return safeAssigned.includes(sport)
}

/** Returns true if a JSON error response was already sent (caller should return). */
export async function respondIfSportForbidden(req: AuthRequest, res: Response, sport: string | null | undefined): Promise<boolean> {
  if (!sport) {
    res.status(400).json({ error: 'Sport could not be determined for this action' })
    return true
  }
  if (req.user!.role === 'Admin') return false
  const [{ data: org }, active] = await Promise.all([
    supabase.from('organizers').select('assigned_sports').eq('profile_id', req.user!.id).maybeSingle(),
    fetchActiveSportSlugs(),
  ])
  const assigned = (org?.assigned_sports as string[] | null) ?? []
  if (organizerMayConfigureSport(req.user!.role, assigned, active, sport)) return false
  res.status(403).json({
    error:
      'Your organizer account is not assigned to this sport. You can view events and teams but only edit those for your assigned sports.',
  })
  return true
}
