import { Router } from 'express'
import { z } from 'zod'
import { resolveParticipantLabelMap } from '../utils/participantLabelMap'

const router = Router()

/** Public bulk label lookup (teams + athletes) for guest/mobile clients. */
router.get('/labels', async (req, res) => {
  const raw = req.query.ids
  let ids: string[] = []
  if (typeof raw === 'string') {
    ids = raw.split(',').map((s) => s.trim()).filter(Boolean)
  } else if (Array.isArray(raw)) {
    ids = raw.flatMap((v) => (typeof v === 'string' ? v.split(',') : [])).map((s) => s.trim()).filter(Boolean)
  }

  try {
    const parsed = z.array(z.string().uuid()).max(200).parse(ids)
    const map = await resolveParticipantLabelMap(parsed)
    res.json(map)
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid ids' })
  }
})

export default router
