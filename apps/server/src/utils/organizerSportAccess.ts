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

export function organizerCoversAllActiveSports(
  assigned: string[] | null | undefined,
  active: AppSport[],
): boolean {
  const set = new Set(assigned ?? [])
  return active.every((s) => set.has(s))
}

export function organizerMayConfigureSport(
  role: string | undefined,
  assigned: string[] | null | undefined,
  active: AppSport[],
  sport: string,
): boolean {
  if (role === 'Admin') return true
  const safeAssigned = assigned ?? []
  if (organizerCoversAllActiveSports(safeAssigned, active)) return true
  return safeAssigned.includes(sport)
}

/** Returns true if a JSON error response was already sent (caller should return). */
export async function respondIfSportForbidden(
  req: AuthRequest,
  res: Response,
  sport: string | null | undefined,
): Promise<boolean> {
  if (!sport) {
    res.status(400).json({ error: 'Sport could not be determined for this action' })
    return true
  }
  if (req.user!.role === 'Admin') return false
  const [{ data: org }, active] = await Promise.all([
    supabase
      .from('organizers')
      .select('assigned_sports')
      .eq('profile_id', req.user!.id)
      .maybeSingle(),
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

/**
 * Combined sport + season access check. Prefer this over stacking
 * respondIfSportForbidden and (the season_staff equivalent in
 * organizerSeasonAccess.ts) separately -- that would double the auth-query
 * count on hot paths like POST /scoring/:matchId/action, and it makes it
 * possible for a handler to check one half of "assigned seasons INTERSECT
 * assigned sports" and forget the other. Fetches the organizer row (with its
 * season_staff assignments embedded in one round trip) and the active-sports
 * list in parallel, evaluates sport first, then season.
 *
 * Pass `seasonId: undefined` (not null) to skip the season check entirely --
 * distinct from an empty/unresolvable seasonId, which is a 400.
 */
export async function respondIfScopeForbidden(
  req: AuthRequest,
  res: Response,
  scope: { sport: string | null | undefined; seasonId: string | null | undefined },
): Promise<boolean> {
  const { sport, seasonId } = scope
  if (!sport) {
    res.status(400).json({ error: 'Sport could not be determined for this action' })
    return true
  }
  if (req.user!.role === 'Admin') return false

  const [{ data: org, error: orgErr }, active] = await Promise.all([
    supabase
      .from('organizers')
      .select('id, assigned_sports, season_staff(season_id)')
      .eq('profile_id', req.user!.id)
      .maybeSingle(),
    fetchActiveSportSlugs(),
  ])

  const assignedSports = (org?.assigned_sports as string[] | null) ?? []
  if (!organizerMayConfigureSport(req.user!.role, assignedSports, active, sport)) {
    res.status(403).json({
      error:
        'Your organizer account is not assigned to this sport. You can view events and teams but only edit those for your assigned sports.',
    })
    return true
  }

  if (seasonId === undefined) return false

  const seasonDenied = {
    error:
      'Your account is not assigned to this season. You can view it but can only edit seasons you are assigned to.',
  }
  if (!seasonId) {
    res.status(400).json({ error: 'Season could not be determined for this action' })
    return true
  }
  if (orgErr || !org) {
    // Fail closed, same reasoning as organizerSeasonAccess.ts's
    // fetchAssignedSeasonIds -- unlike sports, an unresolved season check
    // must never fail open.
    res.status(403).json(seasonDenied)
    return true
  }

  const assignedSeasonIds = (
    (org as unknown as { season_staff?: { season_id: string }[] }).season_staff ?? []
  ).map((r) => r.season_id)
  if (assignedSeasonIds.includes(seasonId)) return false

  res.status(403).json(seasonDenied)
  return true
}
