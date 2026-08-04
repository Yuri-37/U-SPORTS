import { Router } from 'express'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'

const router = Router()

// Anon-key client used only to re-verify a user's current password via sign-in —
// the service-role client can't check a password, it can only overwrite one.
const anonClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

const PASSWORD_CHANGE_COOLDOWN_DAYS = 7
const COOLDOWN_MS = PASSWORD_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
})

router.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
  }
  const { currentPassword, newPassword } = parsed.data
  const userId = req.user!.id
  const email = req.user!.email

  const { error: verifyError } = await anonClient.auth.signInWithPassword({
    email,
    password: currentPassword,
  })
  if (verifyError) {
    // 400, not 401 — the web client's axios interceptor treats any 401 as an
    // expired session and force-signs-out; a wrong *current* password here is
    // a form validation error, not a session problem.
    return res.status(400).json({ error: 'Current password is incorrect' })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('password_changed_at')
    .eq('id', userId)
    .maybeSingle()
  if (profileError) return res.status(500).json({ error: profileError.message })

  const lastChanged = profile?.password_changed_at ? new Date(profile.password_changed_at) : null
  if (lastChanged) {
    const elapsedMs = Date.now() - lastChanged.getTime()
    if (elapsedMs < COOLDOWN_MS) {
      const nextEligible = new Date(lastChanged.getTime() + COOLDOWN_MS)
      const formatted = nextEligible.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      return res.status(429).json({
        error: `You can only change your password once every ${PASSWORD_CHANGE_COOLDOWN_DAYS} days. You can change it again on ${formatted}.`,
        nextEligibleAt: nextEligible.toISOString(),
      })
    }
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  })
  if (updateError) return res.status(400).json({ error: updateError.message })

  const now = new Date().toISOString()
  const { error: stampError } = await supabase
    .from('profiles')
    .update({ password_changed_at: now })
    .eq('id', userId)
  if (stampError)
    console.warn('[change-password] failed to stamp password_changed_at:', stampError.message)

  await writeAuditLog({
    actorId: userId,
    action: 'password_changed',
    entityType: 'profile',
    entityId: userId,
  })

  res.json({ success: true, passwordChangedAt: now })
})

export default router
