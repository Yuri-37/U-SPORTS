import type { Response } from 'express'
import supabase from './supabase'
import { fetchActiveSportSlugs, type AppSport } from './organizerSportAccess'

/**
 * Which sports a season carries (season_sports, migration 064). Falls back to
 * every active sport on a query error or an empty result — a transient DB
 * hiccup must not reject every write for that season, and an unseeded/newly
 * created season with no season_sports rows yet should behave like "anything
 * goes" rather than "nothing is allowed". Mirrors fetchActiveSportSlugs'
 * fallback shape in organizerSportAccess.ts.
 */
export async function fetchSeasonSportSlugs(seasonId: string): Promise<AppSport[]> {
  const [{ data, error }, active] = await Promise.all([
    supabase.from('season_sports').select('sport').eq('season_id', seasonId),
    fetchActiveSportSlugs(),
  ])
  if (error || !data?.length) return active
  const slugs = data.map((r) => r.sport as string).filter((s): s is AppSport => active.includes(s as AppSport))
  return slugs.length > 0 ? slugs : active
}

/**
 * Returns true if a JSON error response was already sent (caller should
 * return). This is a 400, not a 403 -- picking a sport that isn't part of the
 * chosen season is a data-shape mistake, not a permission problem, and it
 * applies to Admins too (an Admin gets no short-circuit here, unlike the
 * sport/season ACCESS checks below).
 */
export async function respondIfSportNotInSeason(
  res: Response,
  seasonId: string | null | undefined,
  sport: string | null | undefined,
): Promise<boolean> {
  if (!seasonId || !sport) {
    res.status(400).json({ error: 'Season and sport are both required for this action' })
    return true
  }
  const seasonSports = await fetchSeasonSportSlugs(seasonId)
  if (seasonSports.includes(sport as AppSport)) return false
  res.status(400).json({
    error: `${sport} is not part of this season. Ask a Super Admin to add it under Seasons.`,
  })
  return true
}
