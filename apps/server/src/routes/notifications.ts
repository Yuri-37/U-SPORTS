import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'

const router = Router()

const pushTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['android', 'ios']),
})

// Register/refresh this device's FCM token against the signed-in profile.
router.post('/push-token', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { token, platform } = pushTokenSchema.parse(req.body)
    const { error } = await supabase.from('push_tokens').upsert(
      {
        profile_id: req.user!.id,
        token,
        platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    )
    if (error) throw new Error(error.message)
    res.json({ ok: true })
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid push token' })
  }
})

// Called on sign-out so a shared/reset device stops receiving another user's pushes.
router.delete('/push-token', requireAuth, async (req: AuthRequest, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : null
  if (!token) return res.status(400).json({ error: 'token is required' })
  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('token', token)
    .eq('profile_id', req.user!.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

export default router
