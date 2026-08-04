import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'
import { respondIfSportForbidden } from '../utils/organizerSportAccess'
import {
  insertNotificationsForProfiles,
  profileIdsForTeamRoster,
} from '../utils/athleteNotifications'

const router = Router()

const EVENT_CATEGORIES: Record<string, string[]> = {
  basketball: ["Men's Open", "Women's Open", "Men's Varsity", "Women's Varsity", 'Mixed'],
  volleyball: ["Men's Open", "Women's Open", "Men's Varsity", "Women's Varsity", 'Mixed'],
  'table-tennis': [
    "Men's Singles",
    "Women's Singles",
    "Men's Doubles",
    "Women's Doubles",
    'Mixed Doubles',
  ],
}

function categorySchema(sport?: string) {
  if (!sport) return z.string().optional()
  const allowed = EVENT_CATEGORIES[sport]
  if (!allowed) return z.string().optional()
  return z.enum(['', ...allowed] as [string, ...string[]]).optional()
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['registration', 'in_progress', 'cancelled'],
  registration: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

async function loadTeamSportSeason(
  teamId: string,
): Promise<{ ok: true; sport: string; season_id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('teams')
    .select('sport, season_id')
    .eq('id', teamId)
    .maybeSingle()
  if (error || !data) return { ok: false, error: error?.message ?? 'Team not found' }
  return { ok: true, sport: data.sport as string, season_id: data.season_id as string }
}

router.get('/', async (req, res) => {
  let query = supabase
    .from('events')
    .select('*, season:seasons(id,name,status,start_date,end_date,created_at)')
    .order('created_at', { ascending: false })

  if (req.query.seasonId) query = query.eq('season_id', req.query.seasonId as string)
  if (req.query.sport) query = query.eq('sport', req.query.sport as string)
  if (req.query.status) query = query.eq('status', req.query.status as string)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('events')
    .select('*, season:seasons(*), participants:event_participants(*)')
    .eq('id', req.params.id)
    .single()
  if (error) return res.status(404).json({ error: 'Event not found' })
  res.json(data)
})

router.patch(
  '/:id',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const id = z.string().uuid().parse(req.params.id)
    const { data: event } = await supabase.from('events').select('sport').eq('id', id).maybeSingle()
    if (!event) return res.status(404).json({ error: 'Event not found' })
    if (await respondIfSportForbidden(req, res, event.sport as string)) return

    const schema = z
      .object({
        name: z.string().min(1).optional(),
        description: z.union([z.string().max(4000), z.null()]).optional(),
        category: categorySchema(event.sport as string).optional(),
        table_tennis_format: z.enum(['singles', 'doubles']).optional().nullable(),
        best_of: z
          .union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)])
          .optional()
          .nullable(),
      })
      .refine(
        (o) =>
          o.name !== undefined ||
          o.description !== undefined ||
          o.category !== undefined ||
          o.table_tennis_format !== undefined ||
          o.best_of !== undefined,
        { message: 'Provide at least one field to update' },
      )

    try {
      const body = schema.parse(req.body)
      const updates: Record<string, unknown> = {}
      if (body.name !== undefined) updates.name = body.name.trim()
      if (body.description !== undefined) {
        updates.description =
          body.description === null ||
          (typeof body.description === 'string' && body.description.trim() === '')
            ? null
            : body.description.trim()
      }
      if (body.category !== undefined) updates.category = body.category?.trim() || null
      if (body.table_tennis_format !== undefined)
        updates.table_tennis_format = body.table_tennis_format ?? null
      if (body.best_of !== undefined) updates.best_of = body.best_of ?? null

      const { data, error } = await supabase
        .from('events')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error?.code === 'PGRST116' || !data)
        return res.status(404).json({ error: 'Event not found' })
      if (error) return res.status(400).json({ error: error.message })

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'event_updated',
        entityType: 'event',
        entityId: id,
        details: { fields: Object.keys(updates) },
      })
      res.json(data)
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed' })
    }
  },
)

router.post('/', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const sport = z.enum(['basketball', 'volleyball', 'table-tennis']).safeParse(req.body?.sport)
  const schema = z.object({
    name: z.string().min(1),
    sport: z.enum(['basketball', 'volleyball', 'table-tennis']),
    season_id: z.string().uuid(),
    format: z.enum(['single_elim', 'double_elim', 'round_robin']),
    category: categorySchema(sport.success ? sport.data : undefined),
    description: z.string().max(4000).optional(),
    table_tennis_format: z.enum(['singles', 'doubles']).optional().nullable(),
    best_of: z
      .union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)])
      .optional()
      .nullable(),
  })

  try {
    const body = schema.parse(req.body)
    if (await respondIfSportForbidden(req, res, body.sport)) return

    const { description: rawDescription, table_tennis_format, best_of, ...rest } = body
    const category = rest.category?.trim() || null
    const description =
      typeof rawDescription === 'string' && rawDescription.trim() !== ''
        ? rawDescription.trim()
        : null
    const ttFormat = rest.sport === 'table-tennis' ? (table_tennis_format ?? 'singles') : null
    // best_of is only meaningful for sports with sets/games; basketball has no concept of it.
    const effectiveBestOf =
      rest.sport === 'volleyball' || rest.sport === 'table-tennis' ? (best_of ?? null) : null

    const { data, error } = await supabase
      .from('events')
      .insert({
        ...rest,
        category,
        description,
        table_tennis_format: ttFormat,
        best_of: effectiveBestOf,
        created_by: req.user!.id,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'event_created',
      entityType: 'event',
      entityId: data.id,
      details: {
        name: body.name,
        sport: body.sport,
        season_id: body.season_id,
        format: body.format,
      },
    })
    res.status(201).json(data)
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create failed' })
  }
})

router.delete(
  '/:id',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const { data: event } = await supabase
      .from('events')
      .select('sport')
      .eq('id', req.params.id)
      .maybeSingle()
    if (!event) return res.status(404).json({ error: 'Event not found' })
    if (await respondIfSportForbidden(req, res, event.sport as string)) return

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'event_deleted',
      entityType: 'event',
      entityId: req.params.id,
      details: { sport: event.sport },
    })

    const { error } = await supabase.from('events').delete().eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    res.json({ success: true })
  },
)

router.patch(
  '/:id/status',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const { newStatus } = req.body
    const { data: event } = await supabase
      .from('events')
      .select('status, sport')
      .eq('id', req.params.id)
      .single()
    if (!event) return res.status(404).json({ error: 'Event not found' })
    if (await respondIfSportForbidden(req, res, event.sport as string)) return

    const allowed = VALID_TRANSITIONS[event.status] ?? []
    if (!allowed.includes(newStatus)) {
      return res
        .status(400)
        .json({ error: `Cannot transition from ${event.status} to ${newStatus}` })
    }

    if (event.status === 'draft' && newStatus === 'in_progress') {
      return res.status(400).json({
        error:
          'Publish the event first so it appears on the guest hub as upcoming and the bracket is visible; then start it when competition begins.',
      })
    }

    const { data, error } = await supabase
      .from('events')
      .update({ status: newStatus })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'event_status_changed',
      entityType: 'event',
      entityId: req.params.id,
      details: { from: event.status, to: newStatus },
    })
    res.json(data)
  },
)

router.post(
  '/:id/participants',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const { data: event } = await supabase
      .from('events')
      .select('sport, season_id')
      .eq('id', req.params.id)
      .maybeSingle()
    if (!event) return res.status(404).json({ error: 'Event not found' })
    if (await respondIfSportForbidden(req, res, event.sport as string)) return

    const schema = z.object({
      participant_id: z.string().uuid(),
      participant_type: z.enum(['team', 'athlete', 'doubles_pair']),
      seed: z.number().optional(),
    })

    try {
      const body = schema.parse(req.body)
      if (body.participant_type === 'team') {
        const team = await loadTeamSportSeason(body.participant_id)
        if (!team.ok) return res.status(400).json({ error: team.error })
        if (team.sport !== event.sport || team.season_id !== event.season_id) {
          return res.status(400).json({ error: 'Team sport and season must match this event.' })
        }
      }

      const { data, error } = await supabase
        .from('event_participants')
        .insert({ event_id: req.params.id, ...body })
        .select()
        .single()
      if (error) throw new Error(error.message)

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'event_participant_added',
        entityType: 'event_participant',
        entityId: data.id,
        details: {
          event_id: req.params.id,
          participant_id: body.participant_id,
          participant_type: body.participant_type,
        },
      })

      if (body.participant_type === 'team') {
        const teamId = body.participant_id
        const eventId = req.params.id
        void (async () => {
          try {
            const [ids, eventNameRow, teamNameRow] = await Promise.all([
              profileIdsForTeamRoster(teamId),
              supabase.from('events').select('name').eq('id', eventId).maybeSingle(),
              supabase.from('teams').select('name').eq('id', teamId).maybeSingle(),
            ])
            const eventName = eventNameRow.data?.name ?? 'An event'
            const teamName = teamNameRow.data?.name ?? 'Your team'
            await insertNotificationsForProfiles(ids, {
              type: 'team_added_to_event',
              title: 'Your team joined an event',
              body: `${teamName} was added to "${eventName}". Match dates appear when your organizer schedules each game.`,
              data: { event_id: eventId, team_id: teamId },
            })
          } catch (err: unknown) {
            console.error('notifyTeamAddedToEvent:', err)
          }
        })()
      }

      res.status(201).json(data)
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Add participant failed' })
    }
  },
)

router.post(
  '/:id/participants/bulk',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const { data: event } = await supabase
      .from('events')
      .select('sport, season_id')
      .eq('id', req.params.id)
      .maybeSingle()
    if (!event) return res.status(404).json({ error: 'Event not found' })
    if (await respondIfSportForbidden(req, res, event.sport as string)) return

    const schema = z.object({
      participant_ids: z.array(z.string().uuid()).min(1).max(64),
      participant_type: z.enum(['team', 'athlete', 'doubles_pair']),
    })

    try {
      const body = schema.parse(req.body)

      if (body.participant_type === 'team') {
        for (const pid of body.participant_ids) {
          const team = await loadTeamSportSeason(pid)
          if (!team.ok) return res.status(400).json({ error: `Team ${pid}: ${team.error}` })
          if (team.sport !== event.sport || team.season_id !== event.season_id) {
            return res.status(400).json({ error: `Team sport and season must match this event.` })
          }
        }
      }

      const rows = body.participant_ids.map((participant_id) => ({
        event_id: req.params.id,
        participant_id,
        participant_type: body.participant_type,
      }))

      const { data, error } = await supabase.from('event_participants').insert(rows).select()
      if (error) throw new Error(error.message)

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'event_participants_bulk_added',
        entityType: 'event',
        entityId: req.params.id,
        details: { count: body.participant_ids.length, participant_type: body.participant_type },
      })

      if (body.participant_type === 'team') {
        const eventId = req.params.id
        void (async () => {
          try {
            const [eventNameRow] = await Promise.all([
              supabase.from('events').select('name').eq('id', eventId).maybeSingle(),
            ])
            const eventName = eventNameRow.data?.name ?? 'An event'
            for (const teamId of body.participant_ids) {
              const [ids, teamNameRow] = await Promise.all([
                profileIdsForTeamRoster(teamId),
                supabase.from('teams').select('name').eq('id', teamId).maybeSingle(),
              ])
              const teamName = teamNameRow.data?.name ?? 'Your team'
              await insertNotificationsForProfiles(ids, {
                type: 'team_added_to_event',
                title: 'Your team joined an event',
                body: `${teamName} was added to "${eventName}". Match dates appear when your organizer schedules each game.`,
                data: { event_id: eventId, team_id: teamId },
              })
            }
          } catch (err: unknown) {
            console.error('notifyBulkTeamsAddedToEvent:', err)
          }
        })()
      }

      res.status(201).json({ added: (data ?? []).length })
    } catch (err: unknown) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : 'Bulk add participants failed' })
    }
  },
)

router.delete(
  '/:id/participants/:participantId',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const { data: event } = await supabase
      .from('events')
      .select('sport')
      .eq('id', req.params.id)
      .maybeSingle()
    if (!event) return res.status(404).json({ error: 'Event not found' })
    if (await respondIfSportForbidden(req, res, event.sport as string)) return

    await supabase
      .from('event_participants')
      .delete()
      .eq('event_id', req.params.id)
      .eq('participant_id', req.params.participantId)

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'event_participant_removed',
      entityType: 'event',
      entityId: req.params.id,
      details: { participant_id: req.params.participantId },
    })

    res.json({ success: true })
  },
)

router.get('/:id/matches', async (req, res) => {
  const { data, error } = await supabase
    .from('matches')
    .select('*, scores:match_scores(*)')
    .eq('event_id', req.params.id)
    .order('scheduled_at')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.patch(
  '/:id/matches/:matchId/schedule',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const { data: event } = await supabase
      .from('events')
      .select('sport')
      .eq('id', req.params.id)
      .maybeSingle()
    if (!event) return res.status(404).json({ error: 'Event not found' })
    if (await respondIfSportForbidden(req, res, event.sport as string)) return

    const schema = z
      .object({
        scheduled_at: z.string().nullable().optional(),
        venue: z.string().nullable().optional(),
      })
      .refine((o) => o.scheduled_at !== undefined || o.venue !== undefined, {
        message: 'Provide scheduled_at and/or venue',
      })

    try {
      const body = schema.parse(req.body)
      const update: Record<string, unknown> = {}
      if (body.scheduled_at !== undefined) update.scheduled_at = body.scheduled_at
      if (body.venue !== undefined) update.venue = body.venue

      const { data: updatedMatch, error } = await supabase
        .from('matches')
        .update(update)
        .eq('id', req.params.matchId)
        .eq('event_id', req.params.id)
        .select('id, participant_a_id, participant_b_id, scheduled_at, venue')
        .single()
      if (error) return res.status(400).json({ error: error.message })

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'match_schedule_updated',
        entityType: 'match',
        entityId: req.params.matchId,
        details: { event_id: req.params.id, ...update },
      })

      notifyMatchSchedule(updatedMatch).catch((err) => console.error('Schedule notify error:', err))
      res.json({ success: true })
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed' })
    }
  },
)

async function notifyMatchSchedule(match: {
  id: string
  participant_a_id: string | null
  participant_b_id: string | null
  scheduled_at: string | null
  venue: string | null
}) {
  if (!match.scheduled_at) return

  const participantIds = [match.participant_a_id, match.participant_b_id].filter(
    Boolean,
  ) as string[]
  if (participantIds.length === 0) return

  const { data: members } = await supabase
    .from('team_members')
    .select('athlete:athletes(profile_id)')
    .in('team_id', participantIds)

  const recipientIds: string[] = (members ?? [])
    .map((m: any) => m.athlete?.profile_id)
    .filter(Boolean)
  if (recipientIds.length === 0) return

  const scheduledDate = new Date(match.scheduled_at)
  const dateStr = scheduledDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const timeStr = scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const venueStr = match.venue ? ` at ${match.venue}` : ''

  const notifications = recipientIds.map((id) => ({
    recipient_id: id,
    type: 'match_scheduled',
    title: 'Match Scheduled',
    body: `Your upcoming match is set for ${dateStr}, ${timeStr}${venueStr}.`,
    data: { match_id: match.id, scheduled_at: match.scheduled_at, venue: match.venue },
  }))

  for (let i = 0; i < notifications.length; i += 100) {
    await supabase.from('notifications').insert(notifications.slice(i, i + 100))
  }
}

export default router
