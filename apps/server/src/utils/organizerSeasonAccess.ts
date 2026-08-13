import type { Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import supabase from './supabase'

/**
 * Which seasons an organizer/coach is assigned to (season_staff, migration
 * 065), fetched via one embedded query off organizers rather than two
 * sequential round trips.
 *
 * Returns `null` on a query error, distinct from `[]` (a real organizer row
 * with zero assignments). Callers must treat `null` as "deny" -- the
 * opposite of fetchSeasonSportSlugs' fallback-open behavior in
 * seasonSports.ts. Seasons accumulate forever, so failing open here would
 * silently grant write access to every future season on a transient DB
 * hiccup; sports are a small closed set, so failing open there is safe.
 */
export async function fetchAssignedSeasonIds(profileId: string): Promise<string[] | null> {
  const { data, error } = await supabase
    .from('organizers')
    .select('id, season_staff(season_id)')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) return null
  const rows =
    (data as unknown as { season_staff?: { season_id: string }[] } | null)?.season_staff ?? []
  return rows.map((r) => r.season_id)
}

/**
 * No "assigned to every current season -> unrestricted" shortcut here, unlike
 * organizerCoversAllActiveSports in organizerSportAccess.ts. Sports are a
 * small closed set (3 today) so that shortcut is safe; seasons are created
 * indefinitely, so the same shortcut would silently grant access to a season
 * created tomorrow. Explicit assignment only.
 */
export function organizerMayConfigureSeason(
  role: string | undefined,
  assignedSeasonIds: string[] | null,
  seasonId: string,
): boolean {
  if (role === 'Admin') return true
  if (assignedSeasonIds === null) return false
  return assignedSeasonIds.includes(seasonId)
}

/** Returns true if a JSON error response was already sent (caller should return). */
export async function respondIfSeasonForbidden(
  req: AuthRequest,
  res: Response,
  seasonId: string | null | undefined,
): Promise<boolean> {
  if (!seasonId) {
    res.status(400).json({ error: 'Season could not be determined for this action' })
    return true
  }
  if (req.user!.role === 'Admin') return false

  const assignedSeasonIds = await fetchAssignedSeasonIds(req.user!.id)
  if (assignedSeasonIds === null) {
    res.status(500).json({ error: 'Could not verify season access. Please try again.' })
    return true
  }
  if (organizerMayConfigureSeason(req.user!.role, assignedSeasonIds, seasonId)) return false

  res.status(403).json({
    error:
      'Your account is not assigned to this season. You can view it but can only edit seasons you are assigned to.',
  })
  return true
}
