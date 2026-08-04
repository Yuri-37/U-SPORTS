import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'
import { getMaxRoster, getActiveSlots } from '../utils/sportConfig'
import { respondIfSportForbidden } from '../utils/organizerSportAccess'
import { insertNotificationsForProfiles } from '../utils/athleteNotifications'

const router = Router()

const teamSelectEmbedded = `*,
  coaches:team_coaches(organizer:organizers(profile_id)),
  members:team_members(
    id,
    athlete_id,
    lineup_slot,
    athlete:athletes(
      id,
      profile_id,
      student_id,
      sport,
      profile:profiles!athletes_profile_id_fkey(full_name, avatar_url)
    )
  )`

const teamSportEnum = z.enum(['basketball', 'volleyball', 'table-tennis'])

const departmentEnum = z.enum(['SBMA', 'SECA', 'SASE', 'SHS'])

const teamCreateSchema = z.object({
  name: z.string().min(1),
  sport: teamSportEnum,
  season_id: z.string().uuid(),
  department: departmentEnum.optional(),
  captain_id: z.string().uuid().optional(),
})

const teamPatchSchema = z.object({
  name: z.string().min(1).optional(),
  sport: teamSportEnum.optional(),
  season_id: z.string().uuid().optional(),
  department: departmentEnum.nullable().optional(),
  captain_id: z.union([z.string().uuid(), z.null()]).optional(),
})

async function loadOccupiedRosterKeys(
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

router.get('/', async (req, res) => {
  let query = supabase.from('teams').select(teamSelectEmbedded).order('name')
  if (req.query.seasonId) query = query.eq('season_id', req.query.seasonId as string)
  if (req.query.sport) query = query.eq('sport', req.query.sport as string)
  if (req.query.department) query = query.eq('department', req.query.department as string)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

router.get(
  '/my-teams',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const { data: staff } = await supabase
      .from('organizers')
      .select('id')
      .eq('profile_id', req.user!.id)
      .maybeSingle()
    if (!staff) return res.json([])

    const { data, error } = await supabase
      .from('team_coaches')
      .select(`team:teams(${teamSelectEmbedded})`)
      .eq('organizer_id', staff.id)
    if (error) return res.status(500).json({ error: error.message })

    res.json((data ?? []).map((tc: { team?: unknown }) => tc.team).filter(Boolean))
  },
)

router.get('/:id', async (req, res) => {
  const idParsed = z.string().uuid().safeParse(req.params.id)
  if (!idParsed.success) return res.status(400).json({ error: 'Invalid team id' })

  const { data, error } = await supabase
    .from('teams')
    .select(teamSelectEmbedded)
    .eq('id', idParsed.data)
    .maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Team not found' })
  res.json(data)
})

router.post('/', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const parsed = teamCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request'
    return res.status(400).json({ error: msg.includes('uuid') ? 'Select a valid season.' : msg })
  }

  try {
    const body = parsed.data
    if (await respondIfSportForbidden(req, res, body.sport)) return

    const { data, error } = await supabase
      .from('teams')
      .insert({
        name: body.name.trim(),
        sport: body.sport,
        season_id: body.season_id,
        captain_id: body.captain_id,
        department: body.department ?? null,
      })
      .select()
      .single()
    if (error)
      return res
        .status(error.message.includes('violates foreign key') ? 400 : 500)
        .json({ error: error.message })

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_created',
      entityType: 'team',
      entityId: data.id,
      details: { name: body.name, sport: body.sport, season_id: body.season_id },
    })

    res.status(201).json(data)
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create failed' })
  }
})

router.patch(
  '/:id',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const teamId = z.string().uuid().safeParse(req.params.id)
    if (!teamId.success) return res.status(400).json({ error: 'Invalid team id' })

    const parsed = teamPatchSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid request'
      return res
        .status(400)
        .json({ error: msg.includes('uuid') ? 'Invalid season or captain id.' : msg })
    }

    const { data: existingTeam } = await supabase
      .from('teams')
      .select('sport')
      .eq('id', teamId.data)
      .maybeSingle()
    if (!existingTeam) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, existingTeam.sport as string)) return

    const updates: Record<string, unknown> = {}
    const body = parsed.data
    if (body.name !== undefined) updates.name = body.name.trim()
    if (body.sport !== undefined) {
      if (await respondIfSportForbidden(req, res, body.sport)) return
      updates.sport = body.sport
    }
    if (body.season_id !== undefined) updates.season_id = body.season_id
    if (body.captain_id !== undefined) updates.captain_id = body.captain_id
    if (body.department !== undefined) updates.department = body.department
    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: 'No valid fields to update' })

    if (typeof updates.captain_id === 'string') {
      const { data: member } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', teamId.data)
        .eq('athlete_id', updates.captain_id)
        .maybeSingle()
      if (!member) return res.status(400).json({ error: 'Captain must be a member of this team' })
    }

    const { data, error } = await supabase
      .from('teams')
      .update(updates)
      .eq('id', teamId.data)
      .select()
      .single()
    if (error)
      return res
        .status(error.message.includes('violates foreign key') ? 400 : 500)
        .json({ error: error.message })

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_updated',
      entityType: 'team',
      entityId: teamId.data,
      details: { fields: Object.keys(updates) },
    })

    res.json(data)
  },
)

router.delete(
  '/:id',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.id)
    if (!idParsed.success) return res.status(400).json({ error: 'Invalid team id' })

    const { data: team } = await supabase
      .from('teams')
      .select('sport')
      .eq('id', idParsed.data)
      .maybeSingle()
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, team.sport as string)) return

    const { count, error: cErr } = await supabase
      .from('event_participants')
      .select('*', { count: 'exact', head: true })
      .eq('participant_id', idParsed.data)
      .eq('participant_type', 'team')
    if (cErr) return res.status(500).json({ error: cErr.message })
    if ((count ?? 0) > 0)
      return res.status(409).json({ error: 'Remove this team from all events before deleting.' })

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_deleted',
      entityType: 'team',
      entityId: idParsed.data,
      details: { sport: team.sport },
    })

    const { error } = await supabase.from('teams').delete().eq('id', idParsed.data)
    if (error) return res.status(500).json({ error: error.message })
    res.status(204).send()
  },
)

router.post(
  '/:id/members',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const teamId = z.string().uuid().parse(req.params.id)
    const parsed = z.object({ athlete_id: z.string().uuid() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Provide athlete_id.' })

    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .select('id, sport, season_id, name')
      .eq('id', teamId)
      .maybeSingle()
    if (teamErr) return res.status(500).json({ error: teamErr.message })
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, team.sport as string)) return

    let occupied: { athleteIds: Set<string>; profileIds: Set<string> }
    try {
      occupied = await loadOccupiedRosterKeys(
        team.season_id as string,
        team.sport as string,
        teamId,
      )
    } catch (err: unknown) {
      return res
        .status(500)
        .json({ error: err instanceof Error ? err.message : 'Roster check failed' })
    }

    const { count: rosterCount } = await supabase
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
    const maxRoster = getMaxRoster(team.sport)
    if ((rosterCount ?? 0) >= maxRoster) {
      return res
        .status(400)
        .json({ error: `Roster is full. Maximum ${maxRoster} players allowed for ${team.sport}.` })
    }

    const { data: athlete, error: athleteErr } = await supabase
      .from('athletes')
      .select('id, sport, season_status, profile_id')
      .eq('id', parsed.data.athlete_id)
      .maybeSingle()
    if (athleteErr) return res.status(500).json({ error: athleteErr.message })
    if (!athlete) return res.status(400).json({ error: 'Athlete not found' })
    if (athlete.sport !== team.sport)
      return res.status(400).json({ error: 'Athlete sport does not match this team' })
    if (athlete.season_status !== 'active') {
      return res.status(400).json({ error: 'Athlete must be active before competition placement' })
    }
    if (occupied.athleteIds.has(athlete.id) || occupied.profileIds.has(athlete.profile_id)) {
      return res
        .status(400)
        .json({ error: 'This player is already on another team for this sport and season.' })
    }

    const { data, error } = await supabase
      .from('team_members')
      .insert({ team_id: teamId, athlete_id: athlete.id })
      .select()
      .single()
    if (error) {
      if (error.code === '23505')
        return res.status(400).json({ error: 'This athlete is already on this team.' })
      return res.status(400).json({ error: error.message })
    }

    const teamLabel = String(team.name ?? 'your team').trim() || 'your team'
    void insertNotificationsForProfiles([athlete.profile_id], {
      type: 'added_to_team',
      title: 'Added to team',
      body: `You were added to ${teamLabel}. Upcoming games will list your matches here; dates appear when your organizer schedules each game.`,
      data: { team_id: teamId },
    }).catch((err) => console.error('notify added_to_team:', err))

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_member_added',
      entityType: 'team_member',
      entityId: data.id,
      details: { team_id: teamId, athlete_id: athlete.id },
    })

    res.status(201).json(data)
  },
)

router.delete(
  '/:id/members/:membershipId',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const teamId = z.string().uuid().parse(req.params.id)
    const membershipId = z.string().uuid().parse(req.params.membershipId)

    const { data: team } = await supabase
      .from('teams')
      .select('sport')
      .eq('id', teamId)
      .maybeSingle()
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, team.sport as string)) return

    const { data: row } = await supabase
      .from('team_members')
      .select('id, athlete_id')
      .eq('id', membershipId)
      .eq('team_id', teamId)
      .maybeSingle()
    if (!row) return res.status(404).json({ error: 'Roster membership not found' })

    await supabase.from('team_members').delete().eq('id', membershipId)
    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_member_removed',
      entityType: 'team_member',
      entityId: membershipId,
      details: { team_id: teamId, athlete_id: row.athlete_id },
    })

    res.json({ success: true })
  },
)

router.post(
  '/:id/members/bulk-remove',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const teamId = z.string().uuid().parse(req.params.id)
    const parsed = z
      .object({ membership_ids: z.array(z.string().uuid()).min(1).max(100) })
      .safeParse(req.body)
    if (!parsed.success)
      return res.status(400).json({ error: 'Provide membership_ids (1-100 UUIDs).' })

    const { data: team } = await supabase
      .from('teams')
      .select('sport')
      .eq('id', teamId)
      .maybeSingle()
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, team.sport as string)) return

    const ids = parsed.data.membership_ids
    const { data: rows, error } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .in('id', ids)
    if (error) return res.status(500).json({ error: error.message })
    const existingIds = new Set((rows ?? []).map((r: { id: string }) => r.id))
    if (existingIds.size !== ids.length)
      return res.status(400).json({ error: 'One or more roster rows are not on this team.' })

    const { error: delErr } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .in('id', ids)
    if (delErr) return res.status(500).json({ error: delErr.message })

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_members_bulk_removed',
      entityType: 'team',
      entityId: teamId,
      details: { removed_count: ids.length },
    })
    res.json({ success: true, removed: ids.length })
  },
)

router.post(
  '/:id/coach',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .select('sport')
      .eq('id', req.params.id)
      .maybeSingle()
    if (teamErr) return res.status(500).json({ error: teamErr.message })
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, team.sport as string)) return

    const { data: staff } = await supabase
      .from('organizers')
      .select('id')
      .eq('profile_id', req.user!.id)
      .maybeSingle()
    if (!staff) return res.status(404).json({ error: 'Staff profile not found' })

    const { data, error } = await supabase
      .from('team_coaches')
      .insert({ organizer_id: staff.id, team_id: req.params.id })
      .select()
      .single()
    if (error) return res.status(400).json({ error: error.message })

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_coach_assigned',
      entityType: 'team_coach',
      entityId: data.id,
      details: { team_id: req.params.id, organizer_id: staff.id },
    })

    res.status(201).json(data)
  },
)

router.delete(
  '/:id/coach',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const { data: team } = await supabase
      .from('teams')
      .select('sport')
      .eq('id', req.params.id)
      .maybeSingle()
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, team.sport as string)) return

    const { data: staff } = await supabase
      .from('organizers')
      .select('id')
      .eq('profile_id', req.user!.id)
      .maybeSingle()
    if (!staff) return res.status(404).json({ error: 'Staff profile not found' })

    await supabase
      .from('team_coaches')
      .delete()
      .eq('organizer_id', staff.id)
      .eq('team_id', req.params.id)
    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_coach_removed',
      entityType: 'team',
      entityId: req.params.id,
      details: { organizer_id: staff.id },
    })

    res.json({ success: true })
  },
)

router.patch(
  '/:id/lineup',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const teamId = z.string().uuid().parse(req.params.id)
    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .select('id, sport, name')
      .eq('id', teamId)
      .maybeSingle()
    if (teamErr) return res.status(500).json({ error: teamErr.message })
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, team.sport as string)) return

    const parsed = z
      .object({
        slots: z.array(
          z.object({
            member_id: z.string().uuid(),
            lineup_slot: z.number().int().min(1).nullable(),
          }),
        ),
      })
      .safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' })

    const filledSlots = parsed.data.slots
      .filter((s) => s.lineup_slot !== null)
      .map((s) => s.lineup_slot as number)
    if (filledSlots.length > 0) {
      const maxSlot = Math.max(...filledSlots)
      const hardCap = getActiveSlots(team.sport, 'doubles')
      if (maxSlot > hardCap) {
        return res
          .status(400)
          .json({
            error: `Lineup slot ${maxSlot} exceeds max active slots (${hardCap}) for ${team.sport}`,
          })
      }
      if (new Set(filledSlots).size !== filledSlots.length) {
        return res.status(400).json({ error: 'Duplicate lineup slots detected' })
      }
    }

    const memberIds = parsed.data.slots.map((s) => s.member_id)
    const { data: beforeRows } = await supabase
      .from('team_members')
      .select('id, lineup_slot, athlete:athletes(profile_id)')
      .eq('team_id', teamId)
      .in('id', memberIds)

    const beforeMap = new Map<string, number | null>()
    for (const row of beforeRows ?? [])
      beforeMap.set((row as { id: string; lineup_slot: number | null }).id, row.lineup_slot ?? null)

    const updates = await Promise.all(
      parsed.data.slots.map((s) =>
        supabase
          .from('team_members')
          .update({ lineup_slot: s.lineup_slot })
          .eq('id', s.member_id)
          .eq('team_id', teamId),
      ),
    )
    const firstError = updates.find((u) => u.error)
    if (firstError?.error) return res.status(400).json({ error: firstError.error.message })

    const { data: afterRows } = await supabase
      .from('team_members')
      .select('id, lineup_slot, athlete:athletes(profile_id)')
      .eq('team_id', teamId)
      .in('id', memberIds)

    const teamLabel = String(team.name ?? 'your team').trim() || 'your team'
    for (const row of afterRows ?? []) {
      const r = row as {
        id: string
        lineup_slot: number | null
        athlete?: { profile_id?: string | null } | null
      }
      if (!beforeMap.has(r.id)) continue
      const prev = beforeMap.get(r.id) ?? null
      const cur = r.lineup_slot ?? null
      if (prev === cur || !r.athlete?.profile_id) continue

      const body =
        prev === null && cur !== null
          ? `You're in the starting lineup for ${teamLabel} (slot ${cur}).`
          : prev !== null && cur === null
            ? `You were moved to the bench for ${teamLabel}.`
            : `Your lineup assignment was updated for ${teamLabel}.`

      void insertNotificationsForProfiles([r.athlete.profile_id], {
        type: 'lineup_updated',
        title: 'Lineup update',
        body,
        data: { team_id: teamId, team_member_id: r.id },
      }).catch((err) => console.error('notify lineup:', err))
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_lineup_updated',
      entityType: 'team',
      entityId: teamId,
      details: { slot_updates: parsed.data.slots.length },
    })

    res.json({ success: true })
  },
)

export default router
