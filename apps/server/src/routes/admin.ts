import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { passwordZ } from '../utils/passwordSchema'
import { staffEmailZ } from '../utils/emailDomain'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'
import { collectAuditLogUuids, resolveAuditEntityLabels } from '../utils/resolveAuditEntityLabels'
import {
  INSTITUTION_LOGO_ALLOWED_MIMES,
  INSTITUTION_LOGO_MAX_BYTES,
  uploadInstitutionLogoBuffer,
} from '../utils/institutionLogoStorage'
import { validateSeasonDates } from '../utils/seasonDates'
import { fetchActiveSportSlugs, type AppSport } from '../utils/organizerSportAccess'
import {
  createStaffAuthUser,
  inviteEmailsEnabled,
  resetAccountPassword,
  type AccountCreationResult,
  type PasswordResetResult,
} from '../utils/accountEmail'
import { insertNotificationsForProfiles, profileIdsForOrganizerIds } from '../utils/athleteNotifications'

const router = Router()

// The underlying columns are unbounded TEXT, so these caps are the only thing
// bounding what a client can store.
const seasonNameZ = z
  .string()
  .trim()
  .min(1, 'Season name is required')
  .max(80, 'Season name is too long')
const fullNameZ = z.string().trim().min(1, 'Full name is required').max(120, 'Name is too long')

const institutionLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: INSTITUTION_LOGO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (INSTITUTION_LOGO_ALLOWED_MIMES.has(file.mimetype)) cb(null, true)
    else cb(new Error('Only JPEG, PNG, WebP, or SVG images are allowed'))
  },
})

// Get platform stats
router.get('/stats', requireAuth, requireRole('Admin', 'Organizer'), async (_req, res) => {
  const [athletes, events, seasons] = await Promise.all([
    supabase
      .from('athletes')
      .select('id', { count: 'exact', head: true })
      .eq('season_status', 'active'),
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'in_progress'),
    supabase.from('seasons').select('id').eq('status', 'active').single(),
  ])

  res.json({
    totalAthletes: athletes.count ?? 0,
    activeEvents: events.count ?? 0,
    currentSeason: seasons.data,
  })
})

// Lets the Add/Edit Staff, Add Admin, and reset-password forms (staff and
// athlete) know whether email delivery can be relied on -- see
// utils/accountEmail.ts. Any staff role can read this: it's just a
// boolean, and Organizers/Coaches need it too for the athlete reset flow.
router.get('/config', requireAuth, requireRole('Admin', 'Organizer', 'Coach'), async (_req, res) => {
  res.json({ inviteEmailsEnabled: inviteEmailsEnabled() })
})

// List organizers (super admin)
router.get('/organizers', requireAuth, requireRole('Admin'), async (_req, res) => {
  const { data, error } = await supabase
    .from('organizers')
    .select(
      '*, profile:profiles!organizers_profile_id_fkey(id, full_name, email, avatar_url, role, department), season_staff(season_id)',
    )
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

/**
 * One coach per sport, per department: two Coach accounts in the same
 * department may not share a sport. A coach may still hold up to 3 sports,
 * and each department may have its own coach for the same sport. Organizers
 * are unconstrained — the rule applies to the Coach role only.
 *
 * Enforced in the route rather than as a DB constraint because the rule spans
 * two tables (profiles.department + organizers.assigned_sports) and every
 * staff write already goes through the two endpoints below. Same non-atomic
 * tradeoff accepted elsewhere for lock claims — two simultaneous creates could
 * still race, which is not a practical concern for admin-driven staff setup.
 */
async function findCoachSportConflict(
  department: string,
  assignedSports: string[],
  excludeProfileId?: string,
): Promise<{ sport: string; coachName: string } | null> {
  const { data, error } = await supabase
    .from('organizers')
    .select(
      'profile_id, assigned_sports, profile:profiles!organizers_profile_id_fkey(full_name, role, department)',
    )
  if (error) throw new Error(error.message)

  const wanted = new Set(assignedSports)
  for (const row of data ?? []) {
    const profile = (row as { profile?: { full_name?: string; role?: string; department?: string } })
      .profile
    if (!profile || profile.role !== 'Coach' || profile.department !== department) continue
    if (excludeProfileId && row.profile_id === excludeProfileId) continue

    const clash = (row.assigned_sports ?? []).find((s: string) => wanted.has(s))
    if (clash) return { sport: clash, coachName: profile.full_name ?? 'Another coach' }
  }
  return null
}

/** 'table-tennis' -> 'Table Tennis' (assigned_sports are stored as slugs). */
function sportLabel(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Create organizer account (no email — super admin sets password and shares credentials)
router.post('/organizers', requireAuth, requireRole('Admin'), async (req: AuthRequest, res) => {
  const schema = z
    .object({
      email: staffEmailZ,
      full_name: fullNameZ,
      role: z.enum(['Organizer', 'Coach']),
      // Only Coach is department-scoped (see findCoachSportConflict) —
      // Organizers aren't, so this is optional/absent for them.
      department: z.enum(['SBMA', 'SECA', 'SASE', 'SHS']).nullable().optional(),
      assigned_sports: z.array(z.string()).min(1, 'Assign at least one sport'),
      // Optional at the schema level -- required only when invite emails are
      // disabled, checked below (inviteEmailsEnabled() is an env toggle, not
      // something zod can see at schema-build time).
      password: passwordZ.optional(),
      season_ids: z.array(z.string().uuid()).optional(),
    })
    .refine((v) => v.role !== 'Coach' || v.assigned_sports.length === 1, {
      message: 'Coaches must be assigned exactly one sport',
      path: ['assigned_sports'],
    })
    .refine((v) => v.role !== 'Coach' || Boolean(v.department), {
      message: 'Department is required for coaches',
      path: ['department'],
    })
    .refine((v) => inviteEmailsEnabled() || Boolean(v.password), {
      message: 'Password is required',
      path: ['password'],
    })

  try {
    const parsed = schema.parse(req.body)
    const email = parsed.email.trim().toLowerCase()
    const full_name = parsed.full_name.trim()
    const role = parsed.role
    const department = role === 'Coach' ? (parsed.department ?? null) : null
    const assigned_sports = parsed.assigned_sports

    // Check before creating the auth user so a rejection can't leave an
    // orphaned auth user. department is guaranteed non-null here by the
    // schema's refine above.
    if (role === 'Coach' && department) {
      const conflict = await findCoachSportConflict(department, assigned_sports)
      if (conflict) {
        return res.status(400).json({
          error: `${conflict.coachName} is already the ${sportLabel(conflict.sport)} coach for ${department}. Each sport can have only one coach per department.`,
        })
      }
    }

    let account: AccountCreationResult
    try {
      account = await createStaffAuthUser({
        email, password: parsed.password, role, fullName: full_name, department,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not create staff account'
      if (/already registered|already exists/i.test(msg)) {
        return res.status(400).json({
          error:
            'An account with this email already exists. Remove them in Supabase Auth or use another email.',
        })
      }
      throw new Error(msg)
    }
    const userId = account.userId

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      email,
      full_name,
      role,
      department,
    })
    if (profileError) throw new Error(profileError.message)

    const { data: newOrganizer, error: organizerError } = await supabase
      .from('organizers')
      .upsert({
        profile_id: userId,
        assigned_sports,
        is_active: true,
        invited_by: req.user!.id,
      })
      .select('id')
      .single()
    if (organizerError) throw new Error(organizerError.message)

    // A brand-new staff account with zero season_staff rows is locked out of
    // every season until a Super Admin assigns them — a support ticket
    // waiting to happen. Default to every currently draft/active season
    // rather than leaving them with nothing to configure.
    const seasonIds =
      parsed.season_ids ??
      (
        await supabase.from('seasons').select('id').in('status', ['draft', 'active'])
      ).data?.map((s) => s.id as string) ??
      []
    if (seasonIds.length > 0) {
      const { error: seasonStaffErr } = await supabase.from('season_staff').insert(
        seasonIds.map((season_id) => ({
          season_id,
          organizer_id: newOrganizer.id,
          assigned_by: req.user!.id,
        })),
      )
      if (seasonStaffErr) throw new Error(seasonStaffErr.message)
    }

    const { error: auditError } = await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: 'staff_created',
      entity_type: 'staff',
      entity_id: userId,
      details: { email, role, department, assigned_sports, season_count: seasonIds.length },
    })
    if (auditError) throw new Error(auditError.message)

    // Best-effort — a notification failure must never fail account creation,
    // and userId already IS the profile id here (see the auth-user creation
    // above), no organizer-id -> profile-id hop needed like the other sites.
    if (seasonIds.length > 0) {
      insertNotificationsForProfiles([userId], {
        type: 'season_staff_assigned',
        title: 'Assigned to a season',
        body: `You've been added as ${role} on ${seasonIds.length} season${seasonIds.length === 1 ? '' : 's'}. Sign in to see what's assigned to you.`,
        data: { season_ids: seasonIds },
      }).catch((err) => console.error('notify season_staff_assigned:', err))
    }

    res.status(201).json({
      success: true,
      message:
        account.mode === 'invited'
          ? `Invitation email sent to ${email}. They'll set their own password to finish setting up their ${role} account.`
          : `${role} account created for ${email}. They can sign in with this email and the password you set.`,
    })
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' })
    }
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create staff failed' })
  }
})

// Update organizer role, department, sports
router.patch(
  '/organizers/:id',
  requireAuth,
  requireRole('Admin'),
  async (req: AuthRequest, res) => {
    const schema = z
      .object({
        role: z.enum(['Organizer', 'Coach']),
        // Only Coach is department-scoped — see the POST /organizers note above.
        department: z.enum(['SBMA', 'SECA', 'SASE', 'SHS']).nullable().optional(),
        assigned_sports: z.array(z.string()).min(1, 'Assign at least one sport'),
        season_ids: z.array(z.string().uuid()).optional(),
      })
      .refine((v) => v.role !== 'Coach' || v.assigned_sports.length === 1, {
        message: 'Coaches must be assigned exactly one sport',
        path: ['assigned_sports'],
      })
      .refine((v) => v.role !== 'Coach' || Boolean(v.department), {
        message: 'Department is required for coaches',
        path: ['department'],
      })

    try {
      const parsed = schema.parse(req.body)
      const department = parsed.role === 'Coach' ? (parsed.department ?? null) : null

      const { data: org } = await supabase
        .from('organizers')
        .select('profile_id')
        .eq('id', req.params.id)
        .single()
      if (!org) return res.status(404).json({ error: 'Staff member not found' })

      // Exclude this staff member so re-saving their own unchanged sports passes.
      // department is guaranteed non-null here by the schema's refine above.
      if (parsed.role === 'Coach' && department) {
        const conflict = await findCoachSportConflict(
          department,
          parsed.assigned_sports,
          org.profile_id,
        )
        if (conflict) {
          return res.status(400).json({
            error: `${conflict.coachName} is already the ${sportLabel(conflict.sport)} coach for ${department}. Each sport can have only one coach per department.`,
          })
        }
      }

      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ role: parsed.role, department })
        .eq('id', org.profile_id)
      if (profileErr) throw new Error(profileErr.message)

      const { data, error: orgErr } = await supabase
        .from('organizers')
        .update({ assigned_sports: parsed.assigned_sports })
        .eq('id', req.params.id)
        .select()
        .single()
      if (orgErr) throw new Error(orgErr.message)

      // Only touch season_staff when the caller actually sent season_ids —
      // same optional-diff convention as PATCH /admin/seasons/:id's sports
      // and staff_ids, so a request that only changes assigned_sports doesn't
      // silently wipe this person's existing season assignments.
      if (parsed.season_ids !== undefined) {
        const { data: currentRows } = await supabase
          .from('season_staff')
          .select('season_id')
          .eq('organizer_id', req.params.id)
        const current = new Set((currentRows ?? []).map((r) => r.season_id as string))
        const next = new Set(parsed.season_ids)
        const toAdd = parsed.season_ids.filter((id) => !current.has(id))
        const toRemove = [...current].filter((id) => !next.has(id))

        if (toRemove.length > 0) {
          await supabase
            .from('season_staff')
            .delete()
            .eq('organizer_id', req.params.id)
            .in('season_id', toRemove)
        }
        if (toAdd.length > 0) {
          await supabase.from('season_staff').insert(
            toAdd.map((season_id) => ({
              season_id,
              organizer_id: req.params.id,
              assigned_by: req.user!.id,
            })),
          )
        }

        // Best-effort — never fail the request over a notification.
        if (toAdd.length > 0 || toRemove.length > 0) {
          void (async () => {
            const { data: seasonRows } = await supabase
              .from('seasons')
              .select('id, name')
              .in('id', [...toAdd, ...toRemove])
            const nameById = new Map((seasonRows ?? []).map((s) => [s.id as string, s.name as string]))
            if (toAdd.length > 0) {
              await insertNotificationsForProfiles([org.profile_id], {
                type: 'season_staff_assigned',
                title: 'Assigned to a season',
                body: `You've been added to ${toAdd.map((id) => nameById.get(id) ?? 'a season').join(', ')}.`,
                data: { season_ids: toAdd },
              })
            }
            if (toRemove.length > 0) {
              await insertNotificationsForProfiles([org.profile_id], {
                type: 'season_staff_removed',
                title: 'Removed from a season',
                body: `You've been removed from ${toRemove.map((id) => nameById.get(id) ?? 'a season').join(', ')}.`,
                data: { season_ids: toRemove },
              })
            }
          })().catch((err) => console.error('notify season_staff diff:', err))
        }
      }

      await supabase.from('audit_logs').insert({
        actor_id: req.user!.id,
        action: 'staff_updated',
        entity_type: 'staff',
        entity_id: req.params.id,
        details: {
          role: parsed.role,
          department,
          assigned_sports: parsed.assigned_sports,
          season_count: parsed.season_ids?.length,
        },
      })

      res.json(data)
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' })
      }
      res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed' })
    }
  },
)

// Toggle organizer active status
router.patch(
  '/organizers/:id/toggle',
  requireAuth,
  requireRole('Admin'),
  async (req: AuthRequest, res) => {
    const { data: organizer } = await supabase
      .from('organizers')
      .select('is_active, profile_id')
      .eq('id', req.params.id)
      .single()
    if (!organizer) return res.status(404).json({ error: 'Organizer not found' })

    const nextActive = !organizer.is_active

    const { data, error: updErr } = await supabase
      .from('organizers')
      .update({ is_active: nextActive })
      .eq('id', req.params.id)
      .select()
      .single()
    if (updErr) return res.status(500).json({ error: updErr.message })

    // Revoke Auth refresh tokens / sessions when deactivating (admin signOut requires their JWT; ban pulse invalidates sessions).
    if (organizer.is_active && !nextActive && organizer.profile_id) {
      const { error: banErr } = await supabase.auth.admin.updateUserById(organizer.profile_id, {
        ban_duration: '10s',
      })
      if (banErr) console.warn('[admin] organizer deactivate ban:', banErr.message)
      const { error: unbanErr } = await supabase.auth.admin.updateUserById(organizer.profile_id, {
        ban_duration: 'none',
      })
      if (unbanErr) console.warn('[admin] organizer deactivate unban:', unbanErr.message)
    }

    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: organizer.is_active ? 'organizer_deactivated' : 'organizer_activated',
      entity_type: 'staff',
      entity_id: req.params.id,
      details: {},
    })

    res.json(data)
  },
)

// Lets an admin restore an organizer/coach's access: either trigger a
// self-service reset email (mode: 'email', the same flow as
// /auth/forgot-password) or mint a temporary password to relay by hand
// (mode: 'password', the explicit fallback for a dead/unreachable inbox).
router.post(
  '/organizers/:id/reset-password',
  requireAuth,
  requireRole('Admin'),
  async (req: AuthRequest, res) => {
    const mode = req.body?.mode === 'email' ? 'email' : 'password'

    const { data: organizer } = await supabase
      .from('organizers')
      .select('profile_id, profile:profiles!organizers_profile_id_fkey(email)')
      .eq('id', req.params.id)
      .maybeSingle()
    if (!organizer) return res.status(404).json({ error: 'Organizer not found' })

    let result: PasswordResetResult
    try {
      const email = (organizer.profile as { email?: string } | null)?.email
      if (mode === 'email' && !email) {
        return res.status(400).json({ error: 'No email on file for this account' })
      }
      result = await resetAccountPassword({
        profileId: organizer.profile_id,
        email: email ?? '',
        mode,
      })
    } catch (e: unknown) {
      return res.status(400).json({ error: e instanceof Error ? e.message : 'Could not reset password' })
    }

    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: mode === 'email' ? 'organizer_password_reset_email' : 'organizer_password_reset',
      entity_type: 'staff',
      entity_id: req.params.id,
    })

    res.json(result)
  },
)

// List Super Admin accounts
router.get('/admins', requireAuth, requireRole('Admin'), async (_req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, created_at')
    .eq('role', 'Admin')
    .order('created_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

// Create another Super Admin account. Sends an invite email when
// INVITE_EMAILS_ENABLED, otherwise falls back to the admin setting a
// password directly, same pattern as staff creation.
router.post('/admins', requireAuth, requireRole('Admin'), async (req: AuthRequest, res) => {
  const schema = z
    .object({
      email: staffEmailZ,
      full_name: fullNameZ,
      password: passwordZ.optional(),
    })
    .refine((v) => inviteEmailsEnabled() || Boolean(v.password), {
      message: 'Password is required',
      path: ['password'],
    })

  try {
    const parsed = schema.parse(req.body)
    const email = parsed.email.trim().toLowerCase()
    const full_name = parsed.full_name.trim()

    let account: AccountCreationResult
    try {
      account = await createStaffAuthUser({
        email, password: parsed.password, role: 'Admin', fullName: full_name, department: null,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not create admin account'
      if (/already registered|already exists/i.test(msg)) {
        return res.status(400).json({
          error:
            'An account with this email already exists. Remove them in Supabase Auth or use another email.',
        })
      }
      throw new Error(msg)
    }
    const userId = account.userId

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: userId, email, full_name, role: 'Admin' })
    if (profileError) throw new Error(profileError.message)

    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: 'admin_created',
      entity_type: 'staff',
      entity_id: userId,
      details: { email },
    })

    res.status(201).json({
      success: true,
      message:
        account.mode === 'invited'
          ? `Invitation email sent to ${email}. They'll set their own password to finish setting up their Super Admin account.`
          : `Super Admin account created for ${email}. They can sign in with this email and the password you set.`,
    })
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' })
    }
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create admin failed' })
  }
})

// Season management
// GET /admin/seasons — seasons enriched with their sports and assigned staff,
// for the Seasons page and the Organizers staff picker. Plain reads, so no
// role gate beyond auth.
router.get('/seasons', requireAuth, async (_req: AuthRequest, res) => {
  const [{ data: seasons, error }, { data: sportsRows }, { data: staffRows }] = await Promise.all([
    supabase.from('seasons').select('*').order('created_at', { ascending: false }),
    supabase.from('season_sports').select('season_id, sport'),
    supabase
      .from('season_staff')
      .select('season_id, organizer_id, organizer:organizers(profile_id, profile:profiles!organizers_profile_id_fkey(full_name, role))'),
  ])
  if (error) return res.status(500).json({ error: error.message })

  const sportsBySeasonId = new Map<string, string[]>()
  for (const r of sportsRows ?? []) {
    const list = sportsBySeasonId.get(r.season_id as string) ?? []
    list.push(r.sport as string)
    sportsBySeasonId.set(r.season_id as string, list)
  }
  const staffBySeasonId = new Map<string, { organizer_id: string; full_name: string; role: string }[]>()
  for (const r of (staffRows ?? []) as {
    season_id: string
    organizer_id: string
    organizer?: { profile?: { full_name?: string; role?: string } | null } | null
  }[]) {
    const list = staffBySeasonId.get(r.season_id) ?? []
    list.push({
      organizer_id: r.organizer_id,
      full_name: r.organizer?.profile?.full_name ?? 'Staff',
      role: r.organizer?.profile?.role ?? '',
    })
    staffBySeasonId.set(r.season_id, list)
  }

  res.json(
    (seasons ?? []).map((s) => ({
      ...s,
      sports: sportsBySeasonId.get(s.id as string) ?? [],
      staff: staffBySeasonId.get(s.id as string) ?? [],
    })),
  )
})

router.post('/seasons', requireAuth, requireRole('Admin'), async (req: AuthRequest, res) => {
  const schema = z.object({
    name: seasonNameZ,
    start_date: z.string(),
    end_date: z.string(),
    sports: z.array(z.string()).min(1, 'Select at least one sport'),
    staff_ids: z.array(z.string().uuid()).optional(),
  })
  try {
    const { sports, staff_ids, ...body } = schema.parse(req.body)
    const dateCheck = validateSeasonDates(body, { mode: 'create' })
    if (!dateCheck.ok) return res.status(400).json({ error: dateCheck.error })

    const activeSports = await fetchActiveSportSlugs()
    const unknownSports = sports.filter((s) => !activeSports.includes(s as AppSport))
    if (unknownSports.length > 0) {
      return res.status(400).json({ error: `Unknown or inactive sport(s): ${unknownSports.join(', ')}` })
    }

    const { data, error } = await supabase
      .from('seasons')
      .insert({ ...body, status: 'draft', created_by: req.user!.id })
      .select()
      .single()
    if (error) throw new Error(error.message)

    const { error: sportsErr } = await supabase
      .from('season_sports')
      .insert(sports.map((sport) => ({ season_id: data.id, sport })))
    if (sportsErr) {
      // A season with no sports is unusable in every Event/Team form — worse
      // than no season at all, so don't leave one behind on partial failure.
      await supabase.from('seasons').delete().eq('id', data.id)
      throw new Error(sportsErr.message)
    }

    // A season with no assigned staff locks out every non-Admin the moment
    // they try to touch it. Default to every currently-active organizer
    // (mirrors the rollout backfill's own "assign everyone" answer) rather
    // than shipping a season nobody but Admins can configure.
    const staffIds =
      staff_ids ?? (await supabase.from('organizers').select('id')).data?.map((o) => o.id as string) ?? []
    if (staffIds.length > 0) {
      const { error: staffErr } = await supabase
        .from('season_staff')
        .insert(staffIds.map((organizer_id) => ({ season_id: data.id, organizer_id, assigned_by: req.user!.id })))
      if (staffErr) {
        await supabase.from('seasons').delete().eq('id', data.id)
        throw new Error(staffErr.message)
      }

      // Best-effort — never fail season creation over a notification.
      void profileIdsForOrganizerIds(staffIds)
        .then((profileIds) =>
          insertNotificationsForProfiles(profileIds, {
            type: 'season_staff_assigned',
            title: 'Assigned to a season',
            body: `You've been added to the organizing team for "${body.name}".`,
            data: { season_id: data.id },
          }),
        )
        .catch((err) => console.error('notify season_staff_assigned:', err))
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'season_created',
      entityType: 'season',
      entityId: data.id,
      details: { name: body.name, sports, staff_count: staffIds.length },
    })
    res.status(201).json({ ...data, sports, staff_ids: staffIds })
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create season failed' })
  }
})

// Name and dates can never be corrected after creation otherwise — status
// transitions (below) and delete were the only season endpoints that existed.
router.patch('/seasons/:id', requireAuth, requireRole('Admin'), async (req: AuthRequest, res) => {
  const schema = z
    .object({
      name: seasonNameZ.optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      sports: z.array(z.string()).optional(),
      staff_ids: z.array(z.string().uuid()).optional(),
    })
    .refine(
      (v) =>
        v.name !== undefined ||
        v.start_date !== undefined ||
        v.end_date !== undefined ||
        v.sports !== undefined ||
        v.staff_ids !== undefined,
      { message: 'No fields to update' },
    )
  try {
    const { sports, staff_ids, ...body } = schema.parse(req.body)

    const { data: existing, error: fetchErr } = await supabase
      .from('seasons')
      .select('start_date, end_date')
      .eq('id', req.params.id)
      .maybeSingle()
    if (fetchErr) throw new Error(fetchErr.message)
    if (!existing) return res.status(404).json({ error: 'Season not found' })

    // Merge over the stored row so a request that only patches one date field
    // is still validated against the other's stored value.
    const merged = {
      start_date: body.start_date ?? existing.start_date,
      end_date: body.end_date ?? existing.end_date,
    }
    const dateCheck = validateSeasonDates(merged, {
      mode: 'edit',
      storedStartDate: existing.start_date,
    })
    if (!dateCheck.ok) return res.status(400).json({ error: dateCheck.error })

    if (sports !== undefined) {
      const activeSports = await fetchActiveSportSlugs()
      const unknownSports = sports.filter((s) => !activeSports.includes(s as AppSport))
      if (unknownSports.length > 0) {
        return res
          .status(400)
          .json({ error: `Unknown or inactive sport(s): ${unknownSports.join(', ')}` })
      }
      if (sports.length === 0) {
        return res
          .status(400)
          .json({ error: 'A season must carry at least one sport. Remove the season instead.' })
      }

      const { data: currentRows } = await supabase
        .from('season_sports')
        .select('sport')
        .eq('season_id', req.params.id)
      const current = new Set((currentRows ?? []).map((r) => r.sport as string))
      const next = new Set(sports)
      const toAdd = sports.filter((s) => !current.has(s))
      const toRemove = [...current].filter((s) => !next.has(s))

      if (toRemove.length > 0) {
        const [{ count: teamCount }, { count: eventCount }] = await Promise.all([
          supabase
            .from('teams')
            .select('*', { count: 'exact', head: true })
            .eq('season_id', req.params.id)
            .in('sport', toRemove),
          supabase
            .from('events')
            .select('*', { count: 'exact', head: true })
            .eq('season_id', req.params.id)
            .in('sport', toRemove),
        ])
        if ((teamCount ?? 0) > 0 || (eventCount ?? 0) > 0) {
          return res.status(400).json({
            error: `${teamCount ?? 0} team(s) and ${eventCount ?? 0} event(s) in this season use ${toRemove.join(', ')}. Delete them before removing the sport.`,
          })
        }
      }

      if (toRemove.length > 0) {
        await supabase
          .from('season_sports')
          .delete()
          .eq('season_id', req.params.id)
          .in('sport', toRemove)
      }
      if (toAdd.length > 0) {
        await supabase
          .from('season_sports')
          .insert(toAdd.map((sport) => ({ season_id: req.params.id, sport })))
      }
    }

    let staffToAdd: string[] = []
    let staffToRemove: string[] = []
    if (staff_ids !== undefined) {
      const { data: currentStaffRows } = await supabase
        .from('season_staff')
        .select('organizer_id')
        .eq('season_id', req.params.id)
      const current = new Set((currentStaffRows ?? []).map((r) => r.organizer_id as string))
      const next = new Set(staff_ids)
      staffToAdd = staff_ids.filter((id) => !current.has(id))
      staffToRemove = [...current].filter((id) => !next.has(id))

      if (staffToRemove.length > 0) {
        await supabase
          .from('season_staff')
          .delete()
          .eq('season_id', req.params.id)
          .in('organizer_id', staffToRemove)
      }
      if (staffToAdd.length > 0) {
        await supabase.from('season_staff').insert(
          staffToAdd.map((organizer_id) => ({
            season_id: req.params.id,
            organizer_id,
            assigned_by: req.user!.id,
          })),
        )
      }
    }

    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) patch.name = body.name
    if (body.start_date !== undefined) patch.start_date = body.start_date
    if (body.end_date !== undefined) patch.end_date = body.end_date

    const data =
      Object.keys(patch).length > 0
        ? (
            await supabase
              .from('seasons')
              .update(patch)
              .eq('id', req.params.id)
              .select()
              .single()
          ).data
        : (await supabase.from('seasons').select().eq('id', req.params.id).single()).data

    // Best-effort — never fail the update over a notification. Waits until
    // here for `data.name` (the season row isn't otherwise fetched earlier
    // in this handler when only staff_ids/sports change, not name/dates).
    if (staffToAdd.length > 0 || staffToRemove.length > 0) {
      const seasonName = (data?.name as string | undefined) ?? 'a season'
      void (async () => {
        if (staffToAdd.length > 0) {
          const profileIds = await profileIdsForOrganizerIds(staffToAdd)
          await insertNotificationsForProfiles(profileIds, {
            type: 'season_staff_assigned',
            title: 'Assigned to a season',
            body: `You've been added to the organizing team for "${seasonName}".`,
            data: { season_id: req.params.id },
          })
        }
        if (staffToRemove.length > 0) {
          const profileIds = await profileIdsForOrganizerIds(staffToRemove)
          await insertNotificationsForProfiles(profileIds, {
            type: 'season_staff_removed',
            title: 'Removed from a season',
            body: `You've been removed from the organizing team for "${seasonName}".`,
            data: { season_id: req.params.id },
          })
        }
      })().catch((err) => console.error('notify season_staff diff:', err))
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'season_updated',
      entityType: 'season',
      entityId: req.params.id,
      details: { ...patch, sports, staff_count: staff_ids?.length },
    })
    res.json(data)
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' })
    }
    res.status(400).json({ error: err instanceof Error ? err.message : 'Update season failed' })
  }
})

router.patch(
  '/seasons/:id/status',
  requireAuth,
  requireRole('Admin'),
  async (req: AuthRequest, res) => {
    const { status } = z
      .object({ status: z.enum(['draft', 'active', 'completed', 'archived']) })
      .parse(req.body)

    // Only one season can be active
    if (status === 'active') {
      await supabase.from('seasons').update({ status: 'completed' }).eq('status', 'active')
    }

    const { data, error } = await supabase
      .from('seasons')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })

    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: `season_${status}`,
      entity_type: 'season',
      entity_id: req.params.id,
      details: {},
    })

    res.json(data)
  },
)

// GET unfinished match count for a season (used by Complete confirmation)
router.get(
  '/seasons/:id/unfinished-matches',
  requireAuth,
  requireRole('Admin'),
  async (req: AuthRequest, res) => {
    const { data: events } = await supabase
      .from('events')
      .select('id')
      .eq('season_id', req.params.id)
    if (!events || events.length === 0) return res.json({ count: 0 })
    const eventIds = events.map((e) => e.id)
    const { count, error } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .in('event_id', eventIds)
      .in('status', ['scheduled', 'live'])
    if (error) return res.status(500).json({ error: error.message })
    res.json({ count: count ?? 0 })
  },
)

router.delete('/seasons/:id', requireAuth, requireRole('Admin'), async (req: AuthRequest, res) => {
  const { data: season } = await supabase
    .from('seasons')
    .select('name')
    .eq('id', req.params.id)
    .maybeSingle()

  // Prevent deleting a season that has events/matches tied to it unless they are all completed/cancelled
  const { data: events } = await supabase.from('events').select('id').eq('season_id', req.params.id)
  if (events && events.length > 0) {
    const eventIds = events.map((e) => e.id)
    const { count } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .in('event_id', eventIds)
      .in('status', ['scheduled', 'live'])
    if ((count ?? 0) > 0) {
      return res
        .status(400)
        .json({ error: 'Season has unfinished matches. Complete or cancel them before deleting.' })
    }
  }

  const { error } = await supabase.from('seasons').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })

  await supabase.from('audit_logs').insert({
    actor_id: req.user!.id,
    action: 'season_deleted',
    entity_type: 'season',
    entity_id: req.params.id,
    // Captured before delete since the row won't be there to resolve a name from later.
    details: { name: season?.name ?? null },
  })

  res.json({ ok: true })
})

router.post(
  '/institution/logo',
  requireAuth,
  requireRole('Admin'),
  (req, res, next) => {
    institutionLogoUpload.single('file')(req, res, (err: unknown) => {
      if (err instanceof Error) return res.status(400).json({ error: err.message })
      if (err) return res.status(400).json({ error: 'Upload failed' })
      next()
    })
  },
  async (req: AuthRequest, res) => {
    try {
      const file = req.file
      if (!file?.buffer) return res.status(400).json({ error: 'No file uploaded' })

      const { publicUrl } = await uploadInstitutionLogoBuffer({
        buffer: file.buffer,
        mimetype: file.mimetype,
        folder: 'school',
      })

      const { data, error } = await supabase
        .from('institution')
        .update({ logo_url: publicUrl })
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .select()
        .single()

      if (error) return res.status(500).json({ error: error.message })

      await supabase.from('audit_logs').insert({
        actor_id: req.user!.id,
        action: 'institution_logo_updated',
        entity_type: 'institution',
        entity_id: null,
        details: { logo_url: publicUrl },
      })

      res.json(data)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Upload failed'
      res.status(400).json({ error: message })
    }
  },
)

// Update institution (school profile)
router.patch('/institution', requireAuth, requireRole('Admin'), async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from('institution')
    .update(req.body)
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })

  await supabase.from('audit_logs').insert({
    actor_id: req.user!.id,
    action: 'institution_updated',
    entity_type: 'institution',
    entity_id: null,
    details: req.body,
  })

  res.json(data)
})

// Get audit logs
router.get('/audit', requireAuth, requireRole('Admin'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Number(req.query.offset) || 0
  const action = typeof req.query.action === 'string' ? req.query.action.trim() : ''
  const entityType = typeof req.query.entityType === 'string' ? req.query.entityType.trim() : ''
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''

  let query = supabase
    .from('audit_logs')
    .select('*, actor:profiles(full_name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (action) query = query.eq('action', action)
  if (entityType) query = query.eq('entity_type', entityType)

  if (q) {
    // Free-text search spans the actor's name/email (resolved to ids first, since
    // PostgREST .or() can't combine a same-table OR with a joined-table match in
    // one filter string) plus the action and entity_type columns directly.
    const { data: matchingActors } = await supabase
      .from('profiles')
      .select('id')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(200)
    const actorIds = (matchingActors ?? []).map((a) => a.id)
    const orParts = [`action.ilike.%${q}%`, `entity_type.ilike.%${q}%`]
    if (actorIds.length > 0) orParts.push(`actor_id.in.(${actorIds.join(',')})`)
    query = query.or(orParts.join(','))
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1)

  if (error) return res.status(500).json({ error: error.message })

  // Every writeAuditLog() call site stores raw ids (event_id, winner_id, athlete_id,
  // team_id, ...) with no name attached — resolve them all in one batch here so the
  // Audit Logs screen can show names instead of UUIDs, without touching the ~40
  // call sites that write these rows.
  const labels = await resolveAuditEntityLabels(collectAuditLogUuids(data ?? []))

  res.json({ data, total: count, labels })
})

// Repair stale player_season_stats row (games_played / JSON aggregates) from player_game_stats via DB RPC
router.post(
  '/recompute-player-season-stats',
  requireAuth,
  requireRole('Admin'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      athlete_id: z.string().uuid(),
      season_id: z.string().uuid(),
    })

    try {
      const { athlete_id, season_id } = schema.parse(req.body)

      const { error } = await supabase.rpc('recompute_player_season_stats', {
        p_athlete_id: athlete_id,
        p_season_id: season_id,
      })

      if (error) return res.status(400).json({ error: error.message })

      const { data: row, error: selErr } = await supabase
        .from('player_season_stats')
        .select('*')
        .eq('athlete_id', athlete_id)
        .eq('season_id', season_id)
        .maybeSingle()

      if (selErr) return res.status(500).json({ error: selErr.message })

      await supabase.from('audit_logs').insert({
        actor_id: req.user!.id,
        action: 'player_season_stats_recomputed',
        entity_type: 'athlete',
        entity_id: athlete_id,
        details: { season_id },
      })

      res.json({ ok: true, player_season_stats: row })
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid request' })
    }
  },
)

export default router
