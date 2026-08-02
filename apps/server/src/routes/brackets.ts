import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import { generateBracket, advanceWinner } from '../services/bracketGenerator'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'
import { respondIfSportForbidden } from '../utils/organizerSportAccess'

const router = Router()

// Assign crossover / final teams (split round robin). Must be declared before `/:eventId` so "matches" is not captured as an event id.
router.patch(
  '/matches/:matchId/participants',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const body = z
      .object({
        participant_a_id: z.string().uuid().nullable().optional(),
        participant_b_id: z.string().uuid().nullable().optional(),
      })
      .refine((o) => o.participant_a_id !== undefined || o.participant_b_id !== undefined, {
        message: 'Provide participant_a_id and/or participant_b_id',
      })
      .parse(req.body)

    const matchId = req.params.matchId as string

    const { data: match, error: mErr } = await supabase
      .from('matches')
      .select('id, event_id, bracket_id, status, participant_a_id, participant_b_id')
      .eq('id', matchId)
      .single()
    if (mErr || !match) return res.status(404).json({ error: 'Match not found' })

    const { data: evBr } = await supabase.from('events').select('sport').eq('id', match.event_id).maybeSingle()
    if (!evBr) return res.status(404).json({ error: 'Event not found' })
    if (await respondIfSportForbidden(req, res, evBr.sport as string)) return

    if (match.status === 'live' || match.status === 'completed') {
      return res.status(400).json({ error: 'Cannot change participants once the match has started or finished' })
    }

    const { data: br } = await supabase.from('brackets').select('bracket_type').eq('id', match.bracket_id).single()

    const t = br?.bracket_type ?? ''
    if (!['crossover_semi', 'knockout_final'].includes(t)) {
      return res.status(400).json({
        error: 'Participants can only be edited for crossover semifinals and the knockout final before play',
      })
    }

    const nextA = body.participant_a_id !== undefined ? body.participant_a_id : match.participant_a_id
    const nextB = body.participant_b_id !== undefined ? body.participant_b_id : match.participant_b_id

    const { data: ep } = await supabase.from('event_participants').select('participant_id').eq('event_id', match.event_id)
    const allowed = new Set((ep ?? []).map((r) => r.participant_id))
    if (nextA != null && !allowed.has(nextA)) {
      return res.status(400).json({ error: 'participant_a_id must be a team in this event' })
    }
    if (nextB != null && !allowed.has(nextB)) {
      return res.status(400).json({ error: 'participant_b_id must be a team in this event' })
    }

    await supabase
      .from('matches')
      .update({
        participant_a_id: nextA ?? null,
        participant_b_id: nextB ?? null,
      })
      .eq('id', matchId)

    await supabase
      .from('brackets')
      .update({
        participant_a_id: nextA ?? null,
        participant_b_id: nextB ?? null,
      })
      .eq('id', match.bracket_id)

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'bracket_match_participants_updated',
      entityType: 'match',
      entityId: matchId,
      details: {
        event_id: match.event_id,
        bracket_id: match.bracket_id,
        participant_a_id: nextA ?? null,
        participant_b_id: nextB ?? null,
      },
    })

    res.json({ success: true })
  }
)

// Generate bracket for an event
router.post('/:eventId/generate', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const schema = z.object({
    participantIds: z.array(z.string().uuid()),
    seeds: z.record(z.string(), z.number()).optional(),
  })

  try {
    const { participantIds, seeds } = schema.parse(req.body)

    const { data: event } = await supabase.from('events').select('format, sport').eq('id', req.params.eventId).single()
    if (!event) return res.status(404).json({ error: 'Event not found' })
    if (await respondIfSportForbidden(req, res, event.sport as string)) return

    const result = await generateBracket(req.params.eventId as string, participantIds, event.format as any, seeds)
    await writeAuditLog({
      actorId: req.user!.id,
      action: 'bracket_generated',
      entityType: 'event',
      entityId: req.params.eventId,
      details: {
        participant_count: participantIds.length,
        format: event.format,
      },
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bracket generation failed'
    res.status(400).json({ error: message })
  }
})

// Get brackets for an event
router.get('/:eventId', async (req, res) => {
  const { data, error } = await supabase
    .from('brackets')
    .select('*')
    .eq('event_id', req.params.eventId)
    .order('round')
    .order('match_order')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Advance winner
router.post('/advance', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const schema = z.object({
    matchId: z.string().uuid(),
    winnerId: z.string().uuid(),
  })

  try {
    const { matchId, winnerId } = schema.parse(req.body)
    const { data: matchAdv } = await supabase.from('matches').select('event_id').eq('id', matchId).maybeSingle()
    if (!matchAdv) return res.status(404).json({ error: 'Match not found' })
    const { data: evAdv } = await supabase.from('events').select('sport').eq('id', matchAdv.event_id).maybeSingle()
    if (!evAdv) return res.status(404).json({ error: 'Event not found' })
    if (await respondIfSportForbidden(req, res, evAdv.sport as string)) return

    await advanceWinner(matchId, winnerId)
    await writeAuditLog({
      actorId: req.user!.id,
      action: 'bracket_winner_advanced',
      entityType: 'match',
      entityId: matchId,
      details: { winner_id: winnerId, event_id: matchAdv.event_id },
    })
    res.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Advance failed'
    res.status(400).json({ error: message })
  }
})

export default router
