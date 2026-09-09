import { createRouter } from '../utils/asyncRouter'
import { z } from 'zod'
import { passwordZ } from '../utils/passwordSchema'
import { studentEmailZ } from '../utils/emailDomain'
import { normalizeYearLevel, yearLevelErrorMessage } from '../utils/yearLevel'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import { respondIfSportForbidden } from '../utils/organizerSportAccess'
import {
  resetAccountPassword,
  createAthleteAuthUser,
  type PasswordResetResult,
  type AccountCreationResult,
} from '../utils/accountEmail'
import { generatedPassword } from '../utils/studentAccounts'
import supabase from '../utils/supabase'

const router = createRouter()

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
    // Required: the account is delivered by email (invite link, or the
    // credentials an admin relays), so there is no useful account without a
    // real mailbox to send it to.
    email: studentEmailZ,
    password: passwordZ.optional(),
  })

  try {
    const body = schema.parse(req.body)
    if (await respondIfSportForbidden(req, res, body.sport)) return

    // Optional, but when supplied it has to be a real level for that
    // department (SHS 11-12, college 1st-4th).
    let yearLevel = ''
    if (body.year_level) {
      const normalized = normalizeYearLevel(body.year_level, body.department)
      if (!normalized) {
        return res.status(400).json({ error: yearLevelErrorMessage(body.department) })
      }
      yearLevel = normalized
    }

    const { data: existingAthlete } = await supabase
      .from('athletes')
      .select('id')
      .eq('student_id', body.student_id)
      .maybeSingle()
    if (existingAthlete) {
      return res.status(409).json({ error: `Student ID ${body.student_id} already exists.` })
    }

    const email = body.email.toLowerCase()
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
        yearLevel,
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
        year_level: yearLevel,
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

    // PATCH /bulk guards this exact action by sport; without the same check
    // here a coach blocked from bulk-deactivating another sport's athlete
    // could just do it one at a time.
    const { data: target, error: lookupError } = await supabase
      .from('athletes')
      .select('sport')
      .eq('id', req.params.id)
      .maybeSingle()
    if (lookupError) return res.status(500).json({ error: lookupError.message })
    if (!target) return res.status(404).json({ error: 'Athlete not found' })
    if (await respondIfSportForbidden(req, res, target.sport)) return

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

      // Jersey/position edits are sport-scoped work like every other athlete
      // mutation -- this route was the one that never checked.
      const { data: target, error: lookupError } = await supabase
        .from('athletes')
        .select('sport')
        .eq('id', req.params.id)
        .maybeSingle()
      if (lookupError) return res.status(500).json({ error: lookupError.message })
      if (!target) return res.status(404).json({ error: 'Athlete not found' })
      if (await respondIfSportForbidden(req, res, target.sport)) return

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

// Edit an athlete's core details. Until now the only mutable fields were
// season status and jersey/position, so an athlete created with the wrong
// department, year level, sport or a misspelt name was permanently wrong --
// and since student_id and email are both unique, deleting and re-adding was
// not a workaround either.
router.patch(
  '/:id',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      full_name: z.string().trim().min(1).optional(),
      student_id: z.string().trim().min(1).optional(),
      department: z.enum(['SBMA', 'SECA', 'SASE', 'SHS']).optional(),
      sport: z.enum(['basketball', 'volleyball', 'table-tennis']).optional(),
      year_level: z.string().trim().optional(),
    })

    try {
      const body = schema.parse(req.body)

      const { data: current, error: lookupError } = await supabase
        .from('athletes')
        .select('id, profile_id, sport, department, year_level, student_id')
        .eq('id', req.params.id)
        .maybeSingle()
      if (lookupError) return res.status(500).json({ error: lookupError.message })
      if (!current) return res.status(404).json({ error: 'Athlete not found' })

      // Guard the sport they are in now...
      if (await respondIfSportForbidden(req, res, current.sport)) return
      // ...and the one they would move to, so a coach cannot push an athlete
      // into a sport they do not run.
      if (body.sport && body.sport !== current.sport) {
        if (await respondIfSportForbidden(req, res, body.sport)) return
      }

      // Year level is validated against whichever department applies AFTER
      // this edit -- changing SHS -> SECA makes a stored "11" invalid, so the
      // pair has to be checked together rather than field by field.
      const department = body.department ?? (current.department as string)
      let yearLevel: string | undefined
      if (body.year_level !== undefined) {
        if (body.year_level === '') {
          yearLevel = ''
        } else {
          const normalized = normalizeYearLevel(body.year_level, department)
          if (!normalized) {
            return res.status(400).json({ error: yearLevelErrorMessage(department) })
          }
          yearLevel = normalized
        }
      } else if (body.department && body.department !== current.department) {
        // Department changed but year level was not sent: the existing value
        // may no longer be legal. Re-validate rather than silently leaving a
        // Grade 11 sitting in a college department.
        const existing = (current.year_level as string | null) ?? ''
        if (existing && !normalizeYearLevel(existing, body.department)) {
          return res.status(400).json({
            error: `Year level "${existing}" is not valid for ${body.department}. ${yearLevelErrorMessage(body.department)}`,
          })
        }
      }

      if (body.student_id && body.student_id !== current.student_id) {
        const { data: clash } = await supabase
          .from('athletes')
          .select('id')
          .eq('student_id', body.student_id)
          .neq('id', req.params.id)
          .maybeSingle()
        if (clash) {
          return res.status(409).json({ error: `Student ID ${body.student_id} already exists.` })
        }
      }

      const athletePatch: Record<string, unknown> = {}
      if (body.student_id !== undefined) athletePatch.student_id = body.student_id
      if (body.sport !== undefined) athletePatch.sport = body.sport
      if (body.department !== undefined) athletePatch.department = body.department
      if (yearLevel !== undefined) athletePatch.year_level = yearLevel

      if (Object.keys(athletePatch).length > 0) {
        const { error: updateError } = await supabase
          .from('athletes')
          .update(athletePatch)
          .eq('id', req.params.id)
        if (updateError) return res.status(400).json({ error: updateError.message })
      }

      // full_name lives on profiles, and department is mirrored there (the
      // athlete row is the source of truth; profiles carries a copy for the
      // lists that only join profiles).
      const profilePatch: Record<string, unknown> = {}
      if (body.full_name !== undefined) profilePatch.full_name = body.full_name
      if (body.department !== undefined) profilePatch.department = body.department
      if (Object.keys(profilePatch).length > 0) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update(profilePatch)
          .eq('id', current.profile_id)
        if (profileError) return res.status(400).json({ error: profileError.message })
      }

      const { data: updated, error: refetchError } = await supabase
        .from('athletes')
        .select('*, profile:profiles!athletes_profile_id_fkey(full_name, email, avatar_url)')
        .eq('id', req.params.id)
        .single()
      if (refetchError) return res.status(500).json({ error: refetchError.message })

      await supabase.from('audit_logs').insert({
        actor_id: req.user!.id,
        action: 'athlete_updated',
        entity_type: 'athlete',
        entity_id: req.params.id,
        details: { ...athletePatch, ...profilePatch },
      })

      res.json(updated)
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' })
      }
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : 'Could not update athlete' })
    }
  },
)

// Permanently remove an athlete. Deleting the auth user cascades through
// profiles -> athletes -> team_members, player_game_stats,
// player_season_stats, leaderboard_visibility and verification_documents.
// Migration 071 makes the remaining references (team captaincy, scoring
// attribution, audit actor) null out instead of blocking the delete.
router.delete(
  '/:id',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const { data: athlete, error: lookupError } = await supabase
      .from('athletes')
      .select(
        'id, profile_id, sport, student_id, profile:profiles!athletes_profile_id_fkey(full_name, email)',
      )
      .eq('id', req.params.id)
      .maybeSingle()
    if (lookupError) return res.status(500).json({ error: lookupError.message })
    if (!athlete) return res.status(404).json({ error: 'Athlete not found' })
    if (await respondIfSportForbidden(req, res, athlete.sport)) return

    const rawProfile = athlete.profile as
      | { full_name?: string; email?: string }
      | { full_name?: string; email?: string }[]
      | null
    const profile = (Array.isArray(rawProfile) ? rawProfile[0] : rawProfile) ?? {}

    // Write the audit row BEFORE the delete: afterwards the athlete row is
    // gone, and this is the only remaining record that they existed.
    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: 'athlete_deleted',
      entity_type: 'athlete',
      entity_id: req.params.id,
      details: {
        student_id: athlete.student_id,
        full_name: profile.full_name ?? null,
        email: profile.email ?? null,
        sport: athlete.sport,
      },
    })

    const { error: deleteError } = await supabase.auth.admin.deleteUser(athlete.profile_id)
    if (deleteError) {
      return res.status(400).json({
        error: `Could not delete this athlete: ${deleteError.message}`,
      })
    }

    res.json({ success: true, deleted: req.params.id })
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
      // Same array-or-object shape the delete route above handles; without
      // this an athlete who has an email can be told they have none.
      const rawProfile = athlete.profile as
        | { email?: string }
        | { email?: string }[]
        | null
      const email = (Array.isArray(rawProfile) ? rawProfile[0] : rawProfile)?.email
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
