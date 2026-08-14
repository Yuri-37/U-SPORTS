import { Router } from 'express'
import multer from 'multer'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { AVATAR_ALLOWED_MIMES, AVATAR_MAX_BYTES, uploadAvatarBuffer, deleteAvatar } from '../utils/avatarStorage'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'

const router = Router()

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (AVATAR_ALLOWED_MIMES.has(file.mimetype)) cb(null, true)
    else cb(new Error('Only JPEG, PNG, or WebP images are allowed'))
  },
})

// Self-service avatar upload/removal, open to any authenticated role
// (athletes and staff alike) -- everyone owns their own presentation photo.
// Every other profile field (full_name, role, department, etc.) is
// staff-owned and has no self-service write path here; see 068's removal
// of the profiles_update_own RLS policy for why that boundary matters.
router.post(
  '/avatar',
  requireAuth,
  (req: AuthRequest, res, next) => {
    avatarUpload.single('file')(req, res, (err: unknown) => {
      if (err instanceof Error) return res.status(400).json({ error: err.message })
      if (err) return res.status(400).json({ error: 'Upload failed' })
      next()
    })
  },
  async (req: AuthRequest, res) => {
    try {
      const file = req.file
      if (!file?.buffer) return res.status(400).json({ error: 'No file uploaded' })

      const { publicUrl } = await uploadAvatarBuffer({
        profileId: req.user!.id,
        buffer: file.buffer,
        mimetype: file.mimetype,
      })

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', req.user!.id)
      if (error) return res.status(500).json({ error: error.message })

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'avatar_updated',
        entityType: 'profile',
        entityId: req.user!.id,
      })

      res.json({ avatar_url: publicUrl })
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' })
    }
  },
)

router.delete('/avatar', requireAuth, async (req: AuthRequest, res) => {
  try {
    await deleteAvatar(req.user!.id)

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', req.user!.id)
    if (error) return res.status(500).json({ error: error.message })

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'avatar_removed',
      entityType: 'profile',
      entityId: req.user!.id,
    })

    res.json({ success: true })
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not remove avatar' })
  }
})

export default router
