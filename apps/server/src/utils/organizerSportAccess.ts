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
  scope: {
    sport: string | null | undefined
    seasonId: string | null | undefined
    /**
     * Set by every route that changes ONE team (roster, lineup, coach list). A
     * Coach may then only proceed for a team they coach; Organizers and the
     * Super Admin are unaffected (their limit is sport + season).
     */
    teamId?: string
  },
): Promise<boolean> {
  const { sport, seasonId, teamId } = scope
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

  const teamDenied = async (): Promise<boolean> => {
    if (!teamId || req.user!.role !== 'Coach') return false
    if (org?.id && (await coachesTeam(org.id as string, teamId))) return false
    res.status(403).json({
      error:
        'You can only change teams you coach. Ask the Super Admin or the Organizer for this sport to assign you to this team.',
    })
    return true
  }

  if (seasonId === undefined) return teamDenied()

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
  if (assignedSeasonIds.includes(seasonId)) return teamDenied()

  res.status(403).json(seasonDenied)
  return true
}

/** True when this staff member (organizers.id) is one of the team's coaches. */
export async function coachesTeam(organizerId: string, teamId: string): Promise<boolean> {
  const { data } = await supabase
    .from('team_coaches')
    .select('id')
    .eq('organizer_id', organizerId)
    .eq('team_id', teamId)
    .maybeSingle()
  return !!data
}

/** organizers.id for a signed-in staff profile (null for a Super Admin, who has no row). */
export async function organizerIdForProfile(profileId: string): Promise<string | null> {
  const { data } = await supabase
    .from('organizers')
    .select('id')
    .eq('profile_id', profileId)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/**
 * What a staff account may READ in analytics, insights and exports.
 *
 *  - Super Admin: everything.
 *  - Organizer: only the sports they are assigned to.
 *  - Coach: their assigned sport, and -- once they coach at least one team --
 *    only those teams and the athletes on them. A coach with no team yet has
 *    nothing of their own to look at, so they keep a read-only, sport-wide view
 *    instead of an empty dashboard (teamIds stays null).
 */
export type StaffReadScope = {
  sports: string[] | 'all'
  teamIds: string[] | null
}

export async function getStaffReadScope(req: AuthRequest): Promise<StaffReadScope> {
  if (req.user!.role === 'Admin') return { sports: 'all', teamIds: null }

  const { data: org } = await supabase
    .from('organizers')
    .select('id, assigned_sports')
    .eq('profile_id', req.user!.id)
    .maybeSingle()
  const sports = ((org?.assigned_sports as string[] | null) ?? []).filter(Boolean)

  let teamIds: string[] | null = null
  if (req.user!.role === 'Coach' && org?.id) {
    const { data } = await supabase
      .from('team_coaches')
      .select('team_id')
      .eq('organizer_id', org.id as string)
    const ids = (data ?? []).map((r) => r.team_id as string)
    teamIds = ids.length > 0 ? ids : null
  }
  return { sports, teamIds }
}

export function scopeAllowsSport(scope: StaffReadScope, sport: string | null | undefined): boolean {
  if (scope.sports === 'all') return true
  return !!sport && scope.sports.includes(sport)
}

/** Returns true if a 403 was sent because `sport` is outside the caller's read scope. */
export function respondIfReadSportForbidden(
  res: Response,
  scope: StaffReadScope,
  sport: string | null | undefined,
): boolean {
  if (scopeAllowsSport(scope, sport)) return false
  res.status(403).json({ error: 'Analytics are limited to the sports you are assigned to.' })
  return true
}

/**
 * A coach may change a player only if that player is on a team they coach, or
 * is not on any team yet (a freshly registered player waiting to be rostered).
 * Everyone else belongs to another team's coach. Organizers and the Super Admin
 * are limited by sport, not by team, so this passes for them.
 *
 * Returns true if a 403 was sent.
 */
export async function respondIfAthleteForbidden(
  req: AuthRequest,
  res: Response,
  athleteIds: string[],
): Promise<boolean> {
  if (req.user!.role !== 'Coach' || athleteIds.length === 0) return false

  const organizerId = await organizerIdForProfile(req.user!.id)
  const own = new Set<string>()
  if (organizerId) {
    const { data } = await supabase
      .from('team_coaches')
      .select('team_id')
      .eq('organizer_id', organizerId)
    for (const r of data ?? []) own.add(r.team_id as string)
  }

  const { data: memberships } = await supabase
    .from('team_members')
    .select('athlete_id, team_id')
    .in('athlete_id', athleteIds)
  const byAthlete = new Map<string, string[]>()
  for (const m of memberships ?? []) {
    const list = byAthlete.get(m.athlete_id as string) ?? []
    list.push(m.team_id as string)
    byAthlete.set(m.athlete_id as string, list)
  }
  for (const id of athleteIds) {
    const teams = byAthlete.get(id) ?? []
    if (teams.length > 0 && !teams.some((t) => own.has(t))) {
      res.status(403).json({
        error: "That player is on another coach's team. Only that team's coach can change them.",
      })
      return true
    }
  }
  return false
}

/** Athlete ids on the given teams -- the players a team-scoped coach may see. */
export async function athleteIdsOnTeams(teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return []
  const { data } = await supabase.from('team_members').select('athlete_id').in('team_id', teamIds)
  return [...new Set((data ?? []).map((r) => r.athlete_id as string))]
}
