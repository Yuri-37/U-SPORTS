import { Router } from 'express'
import { z } from 'zod'
import { passwordZ } from '../utils/passwordSchema'
import { studentEmailZ } from '../utils/emailDomain'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import { respondIfSportForbidden } from '../utils/organizerSportAccess'
import {
  resetAccountPassword,
  createAthleteAuthUser,
  type PasswordResetResult,
  type AccountCreationResult,
} from '../utils/accountEmail'
import { generatedEmail, generatedPassword } from '../utils/studentAccounts'
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

// Add a single athlete -- the bulk importer (routes/students.ts) was
// previously the only way to create an athlete account at all. Same account
// creation path (createAthleteAuthUser), just one row instead of a sheet.
router.post('/', requireAuth, requireRole('Organizer', 'Admin', 'Coach'), async (req: AuthRequest, res) => {
  const schema = z.object({
    full_name: z.string().trim().min(1),
    student_id: z.string().trim().min(1),
    department: z.enum(['SBMA', 'SECA', 'SASE', 'SHS']),
    sport: z.enum(['basketball', 'volleyball', 'table-tennis']),
    year_level: z.string().trim().optional().default(''),
    course: z.string().trim().optional().default(''),
    email: studentEmailZ.optional(),
    password: passwordZ.optional(),
  })

  try {
    const body = schema.parse(req.body)
    if (await respondIfSportForbidden(req, res, body.sport)) return

    const { data: existingAthlete } = await supabase
      .from('athletes')
      .select('id')
      .eq('student_id', body.student_id)
      .maybeSingle()
    if (existingAthlete) {
      return res.status(409).json({ error: `Student ID ${body.student_id} already exists.` })
    }

    const email = (body.email ?? generatedEmail(body.student_id)).toLowerCase()
    const password = body.password ?? generatedPassword(body.student_id)

    let account: AccountCreationResult
    try {
      account = await createAthleteAuthUser({
        email,
        password,
        fullName: body.full_name,
        studentId: body.student_id,
        department: body.department,
        course: body.course,
        yearLevel: body.year_level,
      })
    } catch (e: unknown) {
      return res.status(400).json({ error: e instanceof Error ? e.message : 'Could not create auth user' })
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: account.userId,
      email,
      full_name: body.full_name,
      role: null,
      department: body.department,
    })
    if (profileError) return res.status(400).json({ error: profileError.message })

    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .insert({
        profile_id: account.userId,
        student_id: body.student_id,
        sport: body.sport,
        year_level: body.year_level,
        department: body.department,
        season_status: 'active',
      })
      .select('*, profile:profiles!athletes_profile_id_fkey(full_name, email, avatar_url)')
      .single()
    if (athleteError || !athlete) {
      return res.status(400).json({ error: athleteError?.message ?? 'Could not create athlete row' })
    }

    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: 'athlete_created',
      entity_type: 'athlete',
      entity_id: athlete.id as string,
      details: { student_id: body.student_id, email, mode: account.mode },
    })

    res.status(201).json({
      athlete,
      email,
      mode: account.mode,
      // Only meaningful in 'password' mode -- the invited path never sets a
      // password server-side, the invitee picks their own via the email link.
      ...(account.mode === 'password' ? { tempPassword: password } : {}),
    })
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' })
    }
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create athlete' })
  }
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

      // jersey_number lives on athletes (one value per athlete), not
      // team_members — so "unique within a team" has to be checked against
      // whichever teams this athlete currently belongs to. No such check
      // existed before, so two players on one team could both wear #12.
      if (patch.jersey_number != null) {
        const { data: memberships } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('athlete_id', req.params.id)
        const teamIds = [...new Set((memberships ?? []).map((m) => m.team_id as string))]

        if (teamIds.length > 0) {
          const { data: teammates } = await supabase
            .from('team_members')
            .select('athlete_id, athlete:athletes(jersey_number)')
            .in('team_id', teamIds)
            .neq('athlete_id', req.params.id)

          const taken = (teammates ?? []).some((t) => {
            const raw = (t as { athlete?: { jersey_number?: string | null } | { jersey_number?: string | null }[] })
              .athlete
            const a = Array.isArray(raw) ? raw[0] : raw
            return a?.jersey_number === patch.jersey_number
          })
          if (taken) {
            return res.status(409).json({
              error: `Jersey #${patch.jersey_number as string} is already taken on this team.`,
            })
          }
        }
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

// Lets staff restore an athlete's access: either trigger a self-service
// reset email (mode: 'email', the same flow as /auth/forgot-password) or
// mint a temporary password to relay by hand (mode: 'password', the
// explicit fallback for a dead/unreachable inbox). Same helper and same
// choice as the staff reset in routes/admin.ts.
router.post(
  '/:id/reset-password',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const mode = req.body?.mode === 'email' ? 'email' : 'password'

    const { data: athlete, error } = await supabase
      .from('athletes')
      .select('sport, profile_id, profile:profiles!athletes_profile_id_fkey(email)')
      .eq('id', req.params.id)
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!athlete) return res.status(404).json({ error: 'Athlete not found' })
    if (await respondIfSportForbidden(req, res, athlete.sport)) return

    let result: PasswordResetResult
    try {
      const email = (athlete.profile as { email?: string } | null)?.email
      if (mode === 'email' && !email) {
        return res.status(400).json({ error: 'No email on file for this athlete' })
      }
      result = await resetAccountPassword({ profileId: athlete.profile_id, email: email ?? '', mode })
    } catch (e: unknown) {
      return res.status(400).json({ error: e instanceof Error ? e.message : 'Could not reset password' })
    }

    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: mode === 'email' ? 'athlete_password_reset_email' : 'athlete_password_reset',
      entity_type: 'athlete',
      entity_id: req.params.id,
    })

    res.json(result)
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
