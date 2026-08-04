import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { computeInsightsForMatch } from '../services/computeInsights'
import { writeAuditLog } from '../utils/writeAuditLog'

const router = Router()

const listQuerySchema = z.object({
  sport: z.string().optional(),
  entity_type: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  season_id: z.preprocess(
    (val) => (val === '' || val === undefined ? undefined : val),
    z.string().uuid().optional(),
  ),
})

router.get('/', requireAuth, requireRole('Organizer', 'Admin', 'Coach'), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  let seasonId = parsed.data.season_id
  if (!seasonId) {
    const { data: active } = await supabase
      .from('seasons')
      .select('id')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    seasonId = active?.id
  }

  let query = supabase
    .from('insights')
    .select('*')
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('created_at', { ascending: false })

  if (parsed.data.sport) query = query.eq('sport', parsed.data.sport)
  if (parsed.data.entity_type) query = query.eq('entity_type', parsed.data.entity_type)
  if (parsed.data.entity_id) query = query.eq('entity_id', parsed.data.entity_id)

  if (seasonId) {
    query = query.eq('season_id', seasonId)
  } else {
    query = query.is('season_id', null)
  }

  const { data, error } = await query.limit(30)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

const backfillSeasonSchema = z.object({
  seasonId: z.string().uuid(),
  sport: z.enum(['basketball', 'volleyball', 'table-tennis']),
})

/** Re-run insight rules for recent completed matches (fills gaps when matches ended before server-side compute existed). */
router.post(
  '/backfill-season',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const parsed = backfillSeasonSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

    const { seasonId, sport } = parsed.data

    const { data: events, error: evErr } = await supabase
      .from('events')
      .select('id')
      .eq('season_id', seasonId)
      .eq('sport', sport)

    if (evErr) return res.status(500).json({ error: evErr.message })

    const eventIds = (events ?? []).map((e) => e.id)
    if (eventIds.length === 0) {
      await writeAuditLog({
        actorId: req.user!.id,
        action: 'insights_season_backfill',
        entityType: 'season',
        entityId: seasonId,
        details: { sport, matches_processed: 0 },
      })
      return res.json({ ok: true, matchesProcessed: 0 })
    }

    const { data: matches, error: mErr } = await supabase
      .from('matches')
      .select('id')
      .in('event_id', eventIds)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(40)

    if (mErr) return res.status(500).json({ error: mErr.message })

    let processed = 0
    for (const row of matches ?? []) {
      await computeInsightsForMatch(row.id as string, seasonId)
      processed++
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'insights_season_backfill',
      entityType: 'season',
      entityId: seasonId,
      details: { sport, matches_processed: processed },
    })

    res.json({ ok: true, matchesProcessed: processed })
  },
)

export default router
