import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import { respondIfSportForbidden } from '../utils/organizerSportAccess'
import supabase from '../utils/supabase'

const router = Router()

// Get all athletes (with filters)
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  let query = supabase
    .from('athletes')
    .select('*, profile:profiles!athletes_profile_id_fkey(full_name, email, avatar_url)')
    .order('created_at', { ascending: false })

  if (req.query.sport) query = query.eq('sport', req.query.sport as string)
  if (req.query.department) query = query.eq('department', req.query.department as string)
  if (req.query.season_status) query = query.eq('season_status', req.query.season_status as string)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

/** Bulk season-status updates for organizers and super admins */
router.patch(
  '/bulk',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      ids: z.array(z.string().uuid()).min(1).max(500),
      action: z.enum(['set_inactive', 'set_active']),
    })
    try {
      const body = schema.parse(req.body)
      const { data: rows, error } = await supabase
        .from('athletes')
        .select('id, sport')
        .in('id', body.ids)
      if (error) return res.status(500).json({ error: error.message })
      const found = new Set((rows ?? []).map((r: { id: string }) => r.id))
      for (const id of body.ids) {
        if (!found.has(id))
          return res.status(400).json({ error: 'One or more athlete IDs are invalid' })
      }
      const sports = [...new Set((rows ?? []).map((r: { sport: string }) => r.sport))]
      for (const sport of sports) {
        if (await respondIfSportForbidden(req, res, sport)) return
      }

      const nextStatus = body.action === 'set_inactive' ? 'inactive' : 'active'
      const { error: uErr } = await supabase
        .from('athletes')
        .update({ season_status: nextStatus })
        .in('id', body.ids)
      if (uErr) return res.status(500).json({ error: uErr.message })
      await supabase.from('audit_logs').insert(
        body.ids.map((entity_id) => ({
          actor_id: req.user!.id,
          action: `athlete_season_status_${nextStatus}`,
          entity_type: 'athlete',
          entity_id,
          details: { bulk: true },
        })),
      )

      res.json({ success: true, updated: body.ids.length })
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Bulk update failed' })
    }
  },
)

// Toggle season status (active/inactive)
router.patch(
  '/:id/season-status',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const { season_status } = z
      .object({ season_status: z.enum(['active', 'inactive']) })
      .parse(req.body)

    const { data, error } = await supabase
      .from('athletes')
      .update({ season_status })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })

    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: `athlete_season_status_${season_status}`,
      entity_type: 'athlete',
      entity_id: req.params.id,
      details: { season_status },
    })

    res.json(data)
  },
)

router.patch(
  '/:id/roster-details',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      position: z.string().trim().max(120).optional(),
      jersey_number: z.union([z.string().regex(/^\d{1,3}$/), z.literal(''), z.null()]).optional(),
    })

    try {
      const body = schema.parse(req.body)
      const patch: Record<string, unknown> = {}
      if (body.position !== undefined) patch.position = body.position
      if (body.jersey_number !== undefined) {
        patch.jersey_number =
          body.jersey_number === '' || body.jersey_number === null ? null : body.jersey_number
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'No roster fields to update' })
      }

      const { data, error } = await supabase
        .from('athletes')
        .update(patch)
        .eq('id', req.params.id)
        .select()
        .single()

      if (error) return res.status(500).json({ error: error.message })

      await supabase.from('audit_logs').insert({
        actor_id: req.user!.id,
        action: 'athlete_roster_details_updated',
        entity_type: 'athlete',
        entity_id: req.params.id,
        details: patch,
      })

      res.json(data)
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed' })
    }
  },
)

// Get athlete stats
router.get('/:id/stats', async (req, res) => {
  const { data, error } = await supabase
    .from('player_season_stats')
    .select('*')
    .eq('athlete_id', req.params.id)
    .order('updated_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Export roster as CSV
router.get(
  '/export/csv',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (_req, res) => {
    const { data } = await supabase
      .from('athletes')
      .select('*, profile:profiles!athletes_profile_id_fkey(full_name, email)')
      .eq('season_status', 'active')

    const rows = (data ?? []).map((a: any) => ({
      student_id: a.student_id,
      full_name: a.profile?.full_name ?? '',
      email: a.profile?.email ?? '',
      sport: a.sport,
      position: a.position,
      jersey_number: a.jersey_number ?? '',
      year_level: a.year_level,
      department: a.department,
      season_status: a.season_status,
    }))

    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'student_id', title: 'Student ID' },
        { id: 'full_name', title: 'Full Name' },
        { id: 'email', title: 'Email' },
        { id: 'sport', title: 'Sport' },
        { id: 'position', title: 'Position' },
        { id: 'jersey_number', title: 'Jersey #' },
        { id: 'year_level', title: 'Year Level' },
        { id: 'department', title: 'Department' },
        { id: 'season_status', title: 'Season Status' },
      ],
    })

    const csv = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(rows)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="athletes.csv"')
    res.send(csv)
  },
)

export default router

// Helper for sync stringify
function createObjectCsvStringifier(opts: any) {
  const headers = opts.header as { id: string; title: string }[]
  return {
    getHeaderString: () => headers.map((h) => `"${h.title}"`).join(',') + '\n',
    stringifyRecords: (rows: any[]) =>
      rows.map((r) => headers.map((h) => `"${r[h.id] ?? ''}"`).join(',')).join('\n'),
  }
}
