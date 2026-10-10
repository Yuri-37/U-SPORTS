import { createRouter } from '../utils/asyncRouter'
import multer from 'multer'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { AVATAR_ALLOWED_MIMES, AVATAR_MAX_BYTES, uploadAvatarBuffer, deleteAvatar } from '../utils/avatarStorage'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'
import { describeCaughtError } from '../utils/describeCaughtError'
import { normalizeYearLevel, yearLevelErrorMessage } from '../utils/yearLevel'

const router = createRouter()

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
      res.status(400).json({ error: describeCaughtError(err, 'Upload failed') })
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
    res.status(400).json({ error: describeCaughtError(err, 'Could not remove avatar') })
  }
})

// ─── Your data (Data Privacy Act, RA 10173: right to access and to erasure) ───

/**
 * A copy of everything the system holds about the signed-in person, as a JSON
 * download. Open to every role; it only ever reads the caller's own rows.
 * Push tokens are summarised, not exported (they are credentials for a device).
 */
router.get('/export', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id

  const { data: profileRow, error: profileErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (profileErr) return res.status(500).json({ error: profileErr.message })
  const { issued_password_scheme: _scheme, ...profile } = (profileRow ?? {}) as Record<string, unknown>

  const [athleteRes, organizerRes, notificationsRes, tokensRes] = await Promise.all([
    supabase.from('athletes').select('*').eq('profile_id', userId).maybeSingle(),
    supabase.from('organizers').select('*').eq('profile_id', userId).maybeSingle(),
    supabase
      .from('notifications')
      .select('type, title, body, read, created_at')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('push_tokens').select('platform, created_at').eq('profile_id', userId),
  ])

  const athlete = athleteRes.data as { id: string } | null
  const organizer = organizerRes.data as { id: string } | null

  const [memberships, seasonStats, coachedTeams] = await Promise.all([
    athlete
      ? supabase
          .from('team_members')
          .select('*, team:teams(name, sport, season_id)')
          .eq('athlete_id', athlete.id)
      : Promise.resolve({ data: [] }),
    athlete
      ? supabase.from('player_season_stats').select('*').eq('athlete_id', athlete.id)
      : Promise.resolve({ data: [] }),
    organizer
      ? supabase.from('team_coaches').select('team:teams(name, sport)').eq('organizer_id', organizer.id)
      : Promise.resolve({ data: [] }),
  ])

  await writeAuditLog({
    actorId: userId,
    action: 'personal_data_exported',
    entityType: 'profile',
    entityId: userId,
  })

  const stamp = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="u-sports-my-data-${stamp}.json"`)
  res.send(
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        note: 'This is the personal data U-Sports holds about you. Match results you took part in are also shown publicly on the website once an event is completed.',
        profile,
        athlete: athlete ?? null,
        team_memberships: memberships.data ?? [],
        season_statistics: seasonStats.data ?? [],
        staff_assignment: organizer ?? null,
        teams_coached: coachedTeams.data ?? [],
        notifications: notificationsRes.data ?? [],
        registered_devices: tokensRes.data ?? [],
      },
      null,
      2,
    ),
  )
})

// Anon-key client used only to re-verify the password before an irreversible action.
const anonClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm'),
})

/**
 * Erasure for athletes: removes the sign-in account, and with it the profile,
 * roster memberships, season statistics and notifications (all cascade). Needs
 * the current password so a borrowed phone cannot do it.
 *
 * Staff accounts own records others rely on (announcements, audit trail,
 * events), so the Super Admin deactivates them rather than them erasing
 * themselves from here.
 */
router.post('/delete-account', requireAuth, async (req: AuthRequest, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
  }
  if (req.user!.role !== 'Athlete') {
    return res.status(403).json({
      error:
        'Staff accounts are managed by the Super Admin. Ask them to deactivate your account.',
    })
  }

  const userId = req.user!.id
  const { error: verifyError } = await anonClient.auth.signInWithPassword({
    email: req.user!.email,
    password: parsed.data.password,
  })
  if (verifyError) {
    // 400, not 401: a wrong password is a form error, not an expired session.
    return res.status(400).json({ error: 'Password is incorrect' })
  }

  const { data: athlete } = await supabase
    .from('athletes')
    .select('id, student_id')
    .eq('profile_id', userId)
    .maybeSingle()

  // The only record that remains: that an account was erased, and when -- not
  // who it was beyond the student id the school already holds.
  await writeAuditLog({
    actorId: userId,
    action: 'account_self_deleted',
    entityType: 'athlete',
    entityId: athlete?.id ?? userId,
    details: { student_id: athlete?.student_id ?? null },
  })

  try {
    await deleteAvatar(userId)
  } catch {
    // A missing photo must not stop the erasure.
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)
  if (deleteError) {
    return res.status(500).json({ error: `Could not delete the account: ${deleteError.message}` })
  }
  res.json({ success: true })
})

// ─── Edit your own name / year level ──────────────────────────────────────────
//
// Anyone signed in may correct their own name; an athlete may also correct
// their year level (the yearly bump is also done in bulk by the Super Admin).
//
// This is a narrow server route on purpose, NOT a reopened `profiles` UPDATE
// policy: migration 068 removed that policy because it let a user rewrite ANY
// column of their own row -- `role` included -- straight from the browser. The
// schema below is `.strict()` and lists the only two fields that can change;
// anything else (role, email, department...) is rejected, not ignored.

// Letters (any script), digits, spaces and . ' - , only: enough for real names
// ("María José", "O'Brien", "Super Admin 1") while keeping links, e-mail
// addresses, markup and emoji out of a field shown on public pages.
const NAME_PATTERN = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}\s.'’,-]*$/u

const profileEditSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(1, 'Full name is required')
      .max(120, 'Name is too long')
      .regex(NAME_PATTERN, "Names can use letters, numbers, spaces and . ' , - only.")
      .optional(),
    year_level: z.string().trim().max(20).optional(),
  })
  .strict()

router.patch('/', requireAuth, async (req: AuthRequest, res) => {
  const parsed = profileEditSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return res.status(400).json({
      error:
        issue?.code === 'unrecognized_keys'
          ? 'Only your name and year level can be changed here.'
          : (issue?.message ?? 'Invalid request'),
    })
  }
  const { full_name, year_level } = parsed.data
  if (full_name === undefined && year_level === undefined) {
    return res.status(400).json({ error: 'Nothing to change.' })
  }

  const userId = req.user!.id
  const changed: Record<string, { from: string | null; to: string | null }> = {}
  const result: { full_name?: string; year_level?: string } = {}

  if (year_level !== undefined) {
    const { data: athlete, error: athleteErr } = await supabase
      .from('athletes')
      .select('id, department, year_level')
      .eq('profile_id', userId)
      .maybeSingle()
    if (athleteErr) return res.status(500).json({ error: athleteErr.message })
    if (!athlete) return res.status(403).json({ error: 'Only athletes have a year level.' })

    // '' clears it (year level is optional); anything else must be a real
    // level for the athlete's department, stored in its canonical form.
    const next = year_level === '' ? '' : normalizeYearLevel(year_level, athlete.department as string)
    if (next === null) {
      return res.status(400).json({ error: yearLevelErrorMessage(athlete.department as string) })
    }
    if (next !== (athlete.year_level ?? '')) {
      const { error } = await supabase.from('athletes').update({ year_level: next }).eq('id', athlete.id)
      if (error) return res.status(500).json({ error: error.message })
      changed.year_level = { from: (athlete.year_level as string) ?? '', to: next }
    }
    result.year_level = next
  }

  if (full_name !== undefined) {
    const { data: current, error: readErr } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()
    if (readErr) return res.status(500).json({ error: readErr.message })
    if (full_name !== (current?.full_name ?? '')) {
      const { error } = await supabase.from('profiles').update({ full_name }).eq('id', userId)
      if (error) return res.status(500).json({ error: error.message })
      changed.full_name = { from: (current?.full_name as string) ?? null, to: full_name }
    }
    result.full_name = full_name
  }

  if (Object.keys(changed).length > 0) {
    await writeAuditLog({
      actorId: userId,
      action: 'profile_self_edited',
      entityType: 'profile',
      entityId: userId,
      details: changed,
    })
  }
  res.json({ success: true, ...result, changed: Object.keys(changed) })
})

const tourCompletionSchema = z.object({
  tour_id: z.string().min(1).max(40),
  version: z.number().int().min(1),
  reason: z.enum(['completed', 'skipped']),
})

// Records a guided-tour completion/skip so TourOverlay's auto-start doesn't
// re-trigger it (column added in migration 069). Lives here rather than
// routes/auth.ts because the auth router is capped at 20 req/15min --
// replaying tours from the Help Center would burn the budget that password
// changes need. Read-modify-write is fine here: a user only ever writes
// their own row, so there's no real concurrent-write race.
router.post('/tour-completion', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = tourCompletionSchema.parse(req.body)

    const { data: current, error: readErr } = await supabase
      .from('profiles')
      .select('tours_completed')
      .eq('id', req.user!.id)
      .maybeSingle()
    if (readErr) return res.status(500).json({ error: readErr.message })

    const existing = (current?.tours_completed ?? {}) as Record<
      string,
      { at: string; version: number }
    >
    const next = {
      ...existing,
      [body.tour_id]: { at: new Date().toISOString(), version: body.version },
    }

    const { error: writeErr } = await supabase
      .from('profiles')
      .update({ tours_completed: next })
      .eq('id', req.user!.id)
    if (writeErr) return res.status(500).json({ error: writeErr.message })

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'tour_completed',
      entityType: 'profile',
      entityId: req.user!.id,
      details: { tour_id: body.tour_id, version: body.version, reason: body.reason },
    })

    res.json({ tours_completed: next })
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' })
    }
    res.status(400).json({ error: describeCaughtError(err, 'Could not save tour progress') })
  }
})

export default router
