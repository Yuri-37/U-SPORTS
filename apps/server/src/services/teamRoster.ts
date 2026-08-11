/**
 * Roster/lineup rules shared between the single-athlete-at-a-time routes in
 * apps/server/src/routes/teams.ts (POST /:id/members, PATCH /:id/lineup) and
 * the team roster import (POST /teams/import). Extracted so the one-team-per-
 * sport-per-season rule, the roster cap, the sport/active-status checks, and
 * the lineup-slot validation cannot drift between the two entry points.
 */
import supabase from '../utils/supabase'
import { getMaxRoster, getMaxActiveSlots } from '../utils/sportConfig'

export async function loadOccupiedRosterKeys(
  seasonId: string,
  sport: string,
  excludeTeamId: string,
): Promise<{ athleteIds: Set<string>; profileIds: Set<string> }> {
  const { data: teamRows, error: tErr } = await supabase
    .from('teams')
    .select('id')
    .eq('season_id', seasonId)
    .eq('sport', sport)
    .neq('id', excludeTeamId)
  if (tErr) throw new Error(tErr.message)

  const teamIds = (teamRows ?? []).map((t: { id: string }) => t.id)
  const athleteIds = new Set<string>()
  const profileIds = new Set<string>()
  if (teamIds.length === 0) return { athleteIds, profileIds }

  const { data: members, error: mErr } = await supabase
    .from('team_members')
    .select('athlete_id, athlete:athletes(profile_id)')
    .in('team_id', teamIds)
  if (mErr) throw new Error(mErr.message)

  for (const m of members ?? []) {
    const row = m as { athlete_id?: string | null; athlete?: { profile_id?: string | null } | null }
    if (row.athlete_id) athleteIds.add(row.athlete_id)
    if (row.athlete?.profile_id) profileIds.add(row.athlete.profile_id)
  }
  return { athleteIds, profileIds }
}

export type TeamRosterTeam = { id: string; sport: string; season_id: string; name: string }

export type TeamRosterContext = {
  team: TeamRosterTeam
  occupied: { athleteIds: Set<string>; profileIds: Set<string> }
  /** Mutated in place as members are added so a batch import honours the cap without re-querying. */
  rosterCount: number
  maxRoster: number
}

export async function loadTeamRosterContext(team: TeamRosterTeam): Promise<TeamRosterContext> {
  const occupied = await loadOccupiedRosterKeys(team.season_id, team.sport, team.id)
  const { count } = await supabase
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', team.id)
  return { team, occupied, rosterCount: count ?? 0, maxRoster: getMaxRoster(team.sport) }
}

export type AthleteForRoster = {
  id: string
  sport: string
  season_status: string
  profile_id: string
}

export type AddMemberResult =
  | { ok: true; member: Record<string, unknown>; profileId: string }
  | { ok: false; status: number; error: string }

/** Runs every rule POST /:id/members runs, in the same order, with the same
 *  message strings — so behaviour is identical regardless of caller. Does NOT
 *  notify the athlete or write an audit log; callers own those so a batch
 *  import can send one notification/audit entry per team instead of per row. */
export async function addAthleteToTeam(
  ctx: TeamRosterContext,
  athlete: AthleteForRoster,
): Promise<AddMemberResult> {
  if (ctx.rosterCount >= ctx.maxRoster) {
    return {
      ok: false,
      status: 400,
      error: `Roster is full. Maximum ${ctx.maxRoster} players allowed for ${ctx.team.sport}.`,
    }
  }
  if (athlete.sport !== ctx.team.sport) {
    return { ok: false, status: 400, error: 'Athlete sport does not match this team' }
  }
  if (athlete.season_status !== 'active') {
    return { ok: false, status: 400, error: 'Athlete must be active before competition placement' }
  }
  if (ctx.occupied.athleteIds.has(athlete.id) || ctx.occupied.profileIds.has(athlete.profile_id)) {
    return {
      ok: false,
      status: 400,
      error: 'This player is already on another team for this sport and season.',
    }
  }

  const { data, error } = await supabase
    .from('team_members')
    .insert({ team_id: ctx.team.id, athlete_id: athlete.id })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') {
      return { ok: false, status: 400, error: 'This athlete is already on this team.' }
    }
    return { ok: false, status: 400, error: error.message }
  }

  ctx.rosterCount += 1
  ctx.occupied.athleteIds.add(athlete.id)
  ctx.occupied.profileIds.add(athlete.profile_id)

  return { ok: true, member: data, profileId: athlete.profile_id }
}

export type LineupResult = { ok: true } | { ok: false; error: string }

/**
 * The single write path for team_members.lineup_slot — used by both
 * PATCH /teams/:id/lineup and the roster importer's lineup pass. Validates
 * the RESULTING active set (existing rows merged with the requested changes),
 * not just the request in isolation, then commits via the set_team_lineup()
 * Postgres function (migration 062) so a multi-row change (e.g. a two-player
 * swap) can't self-conflict against the partial unique index on
 * (team_id, lineup_slot) depending on write order.
 */
export async function applyLineupSlots(
  teamId: string,
  sport: string,
  slots: { member_id: string; lineup_slot: number | null }[],
): Promise<LineupResult> {
  const cap = getMaxActiveSlots(sport)

  const overCap = slots.find((s) => s.lineup_slot !== null && (s.lineup_slot as number) > cap)
  if (overCap) {
    return {
      ok: false,
      error: `Lineup slot ${overCap.lineup_slot} is invalid — ${sport} allows slots 1-${cap}.`,
    }
  }

  const { data: allRows, error: rowsErr } = await supabase
    .from('team_members')
    .select('id, lineup_slot')
    .eq('team_id', teamId)
  if (rowsErr) return { ok: false, error: rowsErr.message }

  const known = new Set((allRows ?? []).map((r: { id: string }) => r.id))
  const unknown = slots.find((s) => !known.has(s.member_id))
  if (unknown) return { ok: false, error: 'One or more players are not on this team.' }

  const resultMap = new Map<string, number | null>()
  for (const row of (allRows ?? []) as { id: string; lineup_slot: number | null }[]) {
    resultMap.set(row.id, row.lineup_slot ?? null)
  }
  for (const s of slots) resultMap.set(s.member_id, s.lineup_slot)

  const usedSlots = new Set<number>()
  let activeCount = 0
  for (const slot of resultMap.values()) {
    if (slot == null) continue
    activeCount++
    if (usedSlots.has(slot)) {
      return { ok: false, error: `Slot ${slot} would be assigned to two players at once. Bench one first.` }
    }
    usedSlots.add(slot)
  }
  if (activeCount > cap) {
    return {
      ok: false,
      error: `Only ${cap} players can be active for ${sport}. This change would leave ${activeCount} active.`,
    }
  }

  const { error: rpcErr } = await supabase.rpc('set_team_lineup', {
    p_team_id: teamId,
    p_slots: slots,
    p_max_active: cap,
  })
  if (rpcErr) {
    if (rpcErr.message?.includes('LINEUP_CAP_EXCEEDED')) {
      return { ok: false, error: `Only ${cap} players can be active for ${sport}.` }
    }
    return { ok: false, error: rpcErr.message }
  }

  return { ok: true }
}

/** Compacts a team's active lineup down to its sport's cap, benching the
 *  excess (lowest lineup_slot / earliest joined_at kept first — same rule
 *  migration 062 used for the one-time data fix). Returns how many were
 *  benched, or 0 if the team was already within cap. Used when a sport change
 *  (PATCH /teams/:id) leaves a team over its new, smaller cap — benching is
 *  reversible, so this auto-fixes rather than refusing the sport change. */
export async function normalizeTeamLineup(teamId: string, sport: string): Promise<number> {
  const cap = getMaxActiveSlots(sport)
  const { data: rows } = await supabase
    .from('team_members')
    .select('id, lineup_slot, joined_at')
    .eq('team_id', teamId)
    .not('lineup_slot', 'is', null)
    .order('lineup_slot', { ascending: true })
    .order('joined_at', { ascending: true })

  const active = (rows ?? []) as { id: string; lineup_slot: number; joined_at: string }[]
  if (active.length <= cap) return 0

  const keep = active.slice(0, cap)
  const bench = active.slice(cap)
  const slots = [
    ...keep.map((r, i) => ({ member_id: r.id, lineup_slot: i + 1 })),
    ...bench.map((r) => ({ member_id: r.id, lineup_slot: null })),
  ]

  const result = await applyLineupSlots(teamId, sport, slots)
  if (!result.ok) {
    console.warn('[normalizeTeamLineup]', teamId, result.error)
    return 0
  }
  return bench.length
}
