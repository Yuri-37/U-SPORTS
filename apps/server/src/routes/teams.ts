import { Router } from 'express'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'
import {
  respondIfSportForbidden,
  fetchActiveSportSlugs,
  organizerMayConfigureSport,
} from '../utils/organizerSportAccess'
import { insertNotificationsForProfiles } from '../utils/athleteNotifications'
import { getMaxRoster, getMaxActiveSlots } from '../utils/sportConfig'
import { XLSX_MIME, spreadsheetUpload, parseUploadedRows } from '../utils/spreadsheetImport'
import {
  loadTeamRosterContext,
  addAthleteToTeam,
  applyLineupSlots,
  normalizeTeamLineup,
} from '../services/teamRoster'

const router = Router()

const teamSelectEmbedded = `*,
  coaches:team_coaches(organizer:organizers(profile_id)),
  members:team_members(
    id,
    athlete_id,
    lineup_slot,
    athlete:athletes(
      id,
      profile_id,
      student_id,
      sport,
      profile:profiles!athletes_profile_id_fkey(full_name, avatar_url)
    )
  )`

const teamSportEnum = z.enum(['basketball', 'volleyball', 'table-tennis'])

const departmentEnum = z.enum(['SBMA', 'SECA', 'SASE', 'SHS'])

const teamCreateSchema = z.object({
  name: z.string().min(1),
  sport: teamSportEnum,
  season_id: z.string().uuid(),
  department: departmentEnum.optional(),
  captain_id: z.string().uuid().optional(),
})

const teamPatchSchema = z.object({
  name: z.string().min(1).optional(),
  sport: teamSportEnum.optional(),
  season_id: z.string().uuid().optional(),
  department: departmentEnum.nullable().optional(),
  captain_id: z.union([z.string().uuid(), z.null()]).optional(),
})

router.get('/', async (req, res) => {
  let query = supabase.from('teams').select(teamSelectEmbedded).order('name')
  if (req.query.seasonId) query = query.eq('season_id', req.query.seasonId as string)
  if (req.query.sport) query = query.eq('sport', req.query.sport as string)
  if (req.query.department) query = query.eq('department', req.query.department as string)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

router.get(
  '/my-teams',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const { data: staff } = await supabase
      .from('organizers')
      .select('id')
      .eq('profile_id', req.user!.id)
      .maybeSingle()
    if (!staff) return res.json([])

    const { data, error } = await supabase
      .from('team_coaches')
      .select(`team:teams(${teamSelectEmbedded})`)
      .eq('organizer_id', staff.id)
    if (error) return res.status(500).json({ error: error.message })

    res.json((data ?? []).map((tc: { team?: unknown }) => tc.team).filter(Boolean))
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Team roster import from CSV/Excel — one row per PLAYER (team_name repeated
// on every row so one file can create/fill many teams at once), mirroring the
// athlete import in routes/students.ts. Registered ABOVE GET /:id so
// "import-template"/"import"/"import/preview" are never swallowed by the
// z.string().uuid() param parser below.
// ─────────────────────────────────────────────────────────────────────────────

const teamImportRowSchema = z.object({
  team_name: z.string().trim().min(1).max(80),
  sport: teamSportEnum,
  department: departmentEnum.optional(),
  student_id: z.string().trim().min(1),
  full_name: z.string().trim().optional().default(''),
  lineup: z.enum(['active', 'bench']).optional().default('bench'),
})

const teamImportBodySchema = z.object({
  season_id: z.string().uuid(),
  create_missing_teams: z.union([z.boolean(), z.string()]).optional().default(true),
  rows: z.union([z.array(z.record(z.unknown())), z.string()]).optional(),
})

function toBool(v: boolean | string | undefined, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v.toLowerCase() !== 'false'
  return fallback
}

function normalizeTeamImportRow(row: Record<string, unknown>) {
  const lowered = new Map<string, unknown>()
  for (const [key, value] of Object.entries(row)) {
    lowered.set(
      key
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_'),
      value,
    )
  }
  const rawLineup = String(
    lowered.get('lineup') ?? lowered.get('status') ?? lowered.get('role') ?? lowered.get('active') ?? '',
  )
    .trim()
    .toLowerCase()
  const lineup = ['starter', 'starting', 'active', 'yes', '1', 'true'].includes(rawLineup)
    ? 'active'
    : ['bench', 'reserve', 'sub', 'substitute', 'no', '0', 'false', ''].includes(rawLineup)
      ? 'bench'
      : rawLineup

  return {
    team_name: lowered.get('team_name') ?? lowered.get('team'),
    sport: String(lowered.get('sport') ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-'),
    department:
      String(lowered.get('department') ?? lowered.get('dept') ?? '')
        .trim()
        .toUpperCase() || undefined,
    student_id: lowered.get('student_id') ?? lowered.get('school_id') ?? lowered.get('id_number'),
    full_name:
      lowered.get('full_name') ?? lowered.get('name') ?? lowered.get('player') ?? lowered.get('player_name'),
    lineup,
  }
}

type TeamImportRow = {
  row: number
  valid: boolean
  error?: string
  warning?: string
  team_name?: string
  sport?: string
  department?: string
  student_id?: string
  full_name?: string
  lineup?: 'active' | 'bench'
  /** Internal only — never sent in the preview/commit response. */
  athlete?: { id: string; sport: string; season_status: string; profile_id: string }
}

type TeamImportGroup = {
  team_name: string
  sport: string
  department: string | null
  exists: boolean
  team_id: string | null
  will_create: boolean
  existing_count: number
  max_roster: number
  to_add: number
  active_requested: number
  max_active: number
  error?: string
  rows: number[]
}

/**
 * Shared by preview and commit so both see the exact same plan: which rows are
 * valid, which team each valid row belongs to, whether that team already
 * exists, and whether it will be created. Athletes must already exist and be
 * active this season (unknown/inactive student_id is a per-row error) — this
 * import only ever fills rosters, never mints accounts; POST /students/import
 * already owns that flow and its own authorization.
 */
async function buildTeamImportPlan(
  req: AuthRequest,
  rawRows: Record<string, unknown>[],
  seasonId: string,
  createMissingTeams: boolean,
): Promise<{ rows: TeamImportRow[]; groups: TeamImportGroup[] }> {
  const rows: TeamImportRow[] = []
  const parsedRows: { idx: number; data: z.infer<typeof teamImportRowSchema> }[] = []

  rawRows.forEach((raw, idx) => {
    const normalized = normalizeTeamImportRow(raw)
    const parsed = teamImportRowSchema.safeParse(normalized)
    if (!parsed.success) {
      rows.push({
        row: idx + 1,
        valid: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid row',
        team_name: normalized.team_name ? String(normalized.team_name) : undefined,
        sport: normalized.sport || undefined,
        department: normalized.department,
        student_id: normalized.student_id ? String(normalized.student_id) : undefined,
        full_name: normalized.full_name ? String(normalized.full_name) : undefined,
      })
      return
    }
    rows.push({
      row: idx + 1,
      valid: true,
      team_name: parsed.data.team_name,
      sport: parsed.data.sport,
      department: parsed.data.department,
      student_id: parsed.data.student_id,
      full_name: parsed.data.full_name,
      lineup: parsed.data.lineup,
    })
    parsedRows.push({ idx, data: parsed.data })
  })

  if (parsedRows.length === 0) return { rows, groups: [] }

  // In-file duplicates: same student legitimately appears once per sport, never twice in one sport.
  const seen = new Set<string>()
  for (const { idx, data } of parsedRows) {
    const dupKey = `${data.sport}::${data.student_id}`
    if (seen.has(dupKey)) {
      rows[idx] = {
        ...rows[idx],
        valid: false,
        error: `${data.student_id} is duplicated within this file for ${data.sport}.`,
      }
    } else {
      seen.add(dupKey)
    }
  }

  const stillValid = parsedRows.filter(({ idx }) => rows[idx].valid)
  if (stillValid.length === 0) return { rows, groups: [] }

  // Resolve every student_id in one query rather than one round trip per row.
  const studentIds = [...new Set(stillValid.map(({ data }) => data.student_id))]
  const { data: athleteRows } = await supabase
    .from('athletes')
    .select('id, student_id, sport, season_status, profile_id')
    .in('student_id', studentIds)
  const athleteByKey = new Map<
    string,
    { id: string; sport: string; season_status: string; profile_id: string }
  >()
  for (const a of (athleteRows ?? []) as {
    id: string
    student_id: string
    sport: string
    season_status: string
    profile_id: string
  }[]) {
    athleteByKey.set(`${a.sport}::${a.student_id}`, a)
  }

  // Sport permission — computed once per distinct sport in the file, not per row,
  // so a forbidden sport becomes a row-level error rather than a whole-request 403.
  const distinctSports = [...new Set(stillValid.map(({ data }) => data.sport))]
  const [{ data: org }, activeSports] = await Promise.all([
    supabase.from('organizers').select('assigned_sports').eq('profile_id', req.user!.id).maybeSingle(),
    fetchActiveSportSlugs(),
  ])
  const assignedSports = (org?.assigned_sports as string[] | null) ?? []
  const forbiddenSports = new Set(
    distinctSports.filter(
      (s) => !organizerMayConfigureSport(req.user!.role, assignedSports, activeSports, s),
    ),
  )

  for (const { idx, data } of stillValid) {
    if (forbiddenSports.has(data.sport)) {
      rows[idx] = { ...rows[idx], valid: false, error: `You are not assigned to ${data.sport}.` }
      continue
    }
    const athlete = athleteByKey.get(`${data.sport}::${data.student_id}`)
    if (!athlete) {
      rows[idx] = {
        ...rows[idx],
        valid: false,
        error: `No ${data.sport} athlete with student ID ${data.student_id}. Import them under Athletes first.`,
      }
      continue
    }
    if (athlete.season_status !== 'active') {
      rows[idx] = {
        ...rows[idx],
        valid: false,
        error: `${data.student_id} is not an active athlete this season.`,
      }
      continue
    }
    rows[idx] = { ...rows[idx], athlete }
  }

  // Group remaining valid rows by team. Team identity is (sport, season, name)
  // case-insensitively — teams has no name-uniqueness constraint, so matching
  // must be explicit. First non-empty department in a group wins.
  const nowValid = parsedRows.filter(({ idx }) => rows[idx].valid)
  const groupsByKey = new Map<
    string,
    { team_name: string; sport: string; department: string | null; rowIdxs: number[] }
  >()
  for (const { idx, data } of nowValid) {
    const key = `${data.sport}::${data.team_name.trim().toLowerCase().replace(/\s+/g, ' ')}`
    let g = groupsByKey.get(key)
    if (!g) {
      g = { team_name: data.team_name.trim(), sport: data.sport, department: data.department ?? null, rowIdxs: [] }
      groupsByKey.set(key, g)
    }
    g.rowIdxs.push(idx)
    if (!g.department && data.department) g.department = data.department
  }

  const existingTeamsQuery =
    distinctSports.length > 0
      ? await supabase
          .from('teams')
          .select('id, name, sport, department')
          .eq('season_id', seasonId)
          .in('sport', distinctSports)
      : { data: [] as { id: string; name: string; sport: string; department: string | null }[] }

  const groups: TeamImportGroup[] = []
  for (const g of groupsByKey.values()) {
    const matches = (existingTeamsQuery.data ?? []).filter(
      (t) => t.sport === g.sport && t.name.trim().toLowerCase() === g.team_name.toLowerCase(),
    )
    let teamId: string | null = null
    let error: string | undefined
    if (matches.length > 1) {
      error = `Multiple teams named "${g.team_name}" exist for ${g.sport} this season — rename one, or add these players manually.`
    } else if (matches.length === 1) {
      teamId = matches[0].id
    } else if (!createMissingTeams) {
      error = `Team "${g.team_name}" does not exist for ${g.sport} in this season.`
    }

    groups.push({
      team_name: g.team_name,
      sport: g.sport,
      department: g.department,
      exists: matches.length === 1,
      team_id: teamId,
      will_create: matches.length === 0 && createMissingTeams,
      existing_count: 0,
      max_roster: getMaxRoster(g.sport),
      to_add: g.rowIdxs.length,
      active_requested: g.rowIdxs.filter((i) => rows[i].lineup === 'active').length,
      max_active: getMaxActiveSlots(g.sport),
      error,
      rows: g.rowIdxs,
    })
  }

  // Fill in existing_count / existing active count for matched teams, then decide
  // per-row which requested "active" rows actually fit before the cap — the rest
  // still import, just onto the bench, with a non-blocking warning.
  const matchedTeamIds = groups.filter((g) => g.team_id).map((g) => g.team_id as string)
  if (matchedTeamIds.length > 0) {
    const { data: memberRows } = await supabase
      .from('team_members')
      .select('team_id, lineup_slot')
      .in('team_id', matchedTeamIds)
    const totalByTeam = new Map<string, number>()
    const activeByTeam = new Map<string, number>()
    for (const r of (memberRows ?? []) as { team_id: string; lineup_slot: number | null }[]) {
      totalByTeam.set(r.team_id, (totalByTeam.get(r.team_id) ?? 0) + 1)
      if (r.lineup_slot != null) activeByTeam.set(r.team_id, (activeByTeam.get(r.team_id) ?? 0) + 1)
    }
    for (const g of groups) {
      if (!g.team_id) continue
      g.existing_count = totalByTeam.get(g.team_id) ?? 0
      const existingActive = activeByTeam.get(g.team_id) ?? 0
      let free = Math.max(0, g.max_active - existingActive)
      for (const i of g.rows) {
        if (rows[i].lineup !== 'active') continue
        if (free > 0) {
          free--
        } else {
          rows[i] = {
            ...rows[i],
            lineup: 'bench',
            warning: `Added to bench — ${g.sport} allows only ${g.max_active} active.`,
          }
        }
      }
    }
  }
  for (const g of groups) {
    if (!g.team_id) {
      // Brand-new team: cap applies against a clean slate.
      let free = g.max_active
      for (const i of g.rows) {
        if (rows[i].lineup !== 'active') continue
        if (free > 0) {
          free--
        } else {
          rows[i] = {
            ...rows[i],
            lineup: 'bench',
            warning: `Added to bench — ${g.sport} allows only ${g.max_active} active.`,
          }
        }
      }
    }
  }

  // A group-level error (team missing with create disabled, or an ambiguous
  // name match) invalidates every row in that group.
  for (const g of groups) {
    if (!g.error) continue
    for (const i of g.rows) {
      if (rows[i].valid) rows[i] = { ...rows[i], valid: false, error: g.error }
    }
  }

  return { rows, groups }
}

async function readTeamImportRequest(
  req: AuthRequest,
): Promise<{ body: z.infer<typeof teamImportBodySchema>; rawRows: Record<string, unknown>[] }> {
  const body = teamImportBodySchema.parse(req.body)
  let rawRows: Record<string, unknown>[] = Array.isArray(body.rows) ? body.rows : []
  if (req.file?.buffer) {
    rawRows = await parseUploadedRows(req.file)
  } else if (typeof body.rows === 'string') {
    rawRows = JSON.parse(body.rows) as Record<string, unknown>[]
  }
  return { body, rawRows }
}

router.get(
  '/import-template',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (_req: AuthRequest, res) => {
    try {
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Teams')

      ws.columns = [
        { header: 'team_name', key: 'team_name', width: 24 },
        { header: 'sport', key: 'sport', width: 16 },
        { header: 'department', key: 'department', width: 14 },
        { header: 'student_id', key: 'student_id', width: 16 },
        { header: 'full_name', key: 'full_name', width: 26 },
        { header: 'lineup', key: 'lineup', width: 12 },
      ]
      ws.getRow(1).font = { bold: true }
      ws.getColumn('student_id').numFmt = '@'

      // One row per PLAYER, team_name repeated — two example rows so the shape
      // (one file, many players, teams grouped by repeated team_name) is obvious.
      ws.addRow({
        team_name: 'SECA Spikers',
        sport: 'volleyball',
        department: 'SECA',
        student_id: '2024-1001',
        full_name: 'Juan Dela Cruz',
        lineup: 'active',
      })
      ws.addRow({
        team_name: 'SECA Spikers',
        sport: 'volleyball',
        department: 'SECA',
        student_id: '2024-1002',
        full_name: 'Maria Santos',
        lineup: 'bench',
      })

      for (let row = 2; row <= 500; row++) {
        ws.getCell(`B${row}`).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: ['"basketball,volleyball,table-tennis"'],
          showErrorMessage: true,
          errorTitle: 'Invalid sport',
          error: 'Choose basketball, volleyball, or table-tennis.',
        }
        ws.getCell(`C${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"SBMA,SECA,SASE,SHS"'],
          showErrorMessage: true,
          errorTitle: 'Invalid department',
          error: 'Choose SBMA, SECA, SASE, or SHS.',
        }
        ws.getCell(`F${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"active,bench"'],
          showErrorMessage: true,
          errorTitle: 'Invalid lineup',
          error: 'Choose active or bench.',
        }
      }

      const buffer = await wb.xlsx.writeBuffer()
      res.setHeader('Content-Type', XLSX_MIME)
      res.setHeader('Content-Disposition', 'attachment; filename="teams-import-template.xlsx"')
      res.send(Buffer.from(buffer))
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Could not build template' })
    }
  },
)

/** Parses and validates a file/rows the same way /import does, but never writes anything. */
router.post(
  '/import/preview',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  spreadsheetUpload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      const { body, rawRows } = await readTeamImportRequest(req)
      if (rawRows.length === 0) {
        return res.status(400).json({ error: 'Upload a CSV or Excel file, or provide rows.' })
      }

      const createMissingTeams = toBool(body.create_missing_teams, true)
      const { rows, groups } = await buildTeamImportPlan(req, rawRows, body.season_id, createMissingTeams)

      const validCount = rows.filter((r) => r.valid).length
      res.json({
        rows: rows.map(({ athlete: _athlete, ...r }) => r),
        teams: groups.map(({ rows: _rows, ...g }) => g),
        validCount,
        invalidCount: rows.length - validCount,
      })
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not preview file' })
    }
  },
)

router.post(
  '/import',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  spreadsheetUpload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      const { body, rawRows } = await readTeamImportRequest(req)
      if (rawRows.length === 0) {
        return res.status(400).json({ error: 'Upload a CSV or Excel file, or provide rows.' })
      }

      const { data: season } = await supabase
        .from('seasons')
        .select('id')
        .eq('id', body.season_id)
        .maybeSingle()
      if (!season) return res.status(400).json({ error: 'Select a valid season.' })

      const createMissingTeams = toBool(body.create_missing_teams, true)
      const { rows, groups } = await buildTeamImportPlan(req, rawRows, body.season_id, createMissingTeams)

      const createdTeams: { team_id: string; name: string; sport: string }[] = []
      const added: {
        row: number
        team_name: string
        student_id: string
        membership_id: string
        lineup_slot: number | null
      }[] = []
      const errors: { row: number; error: string }[] = []
      for (const r of rows) {
        if (!r.valid) errors.push({ row: r.row, error: r.error ?? 'Invalid row' })
      }

      for (const g of groups) {
        if (g.error) continue // already surfaced as a row-level error above

        let teamId = g.team_id
        if (!teamId) {
          if (await respondIfSportForbidden(req, res, g.sport)) return
          const { data: newTeam, error: createErr } = await supabase
            .from('teams')
            .insert({
              name: g.team_name,
              sport: g.sport,
              season_id: body.season_id,
              department: g.department,
            })
            .select()
            .single()
          if (createErr || !newTeam) {
            for (const i of g.rows) {
              errors.push({ row: rows[i].row, error: createErr?.message ?? 'Could not create team' })
            }
            continue
          }
          teamId = newTeam.id as string
          createdTeams.push({ team_id: teamId, name: g.team_name, sport: g.sport })
          await writeAuditLog({
            actorId: req.user!.id,
            action: 'team_created',
            entityType: 'team',
            entityId: teamId,
            details: { name: g.team_name, sport: g.sport, season_id: body.season_id },
          })
        }

        let ctx
        try {
          ctx = await loadTeamRosterContext({
            id: teamId,
            sport: g.sport,
            season_id: body.season_id,
            name: g.team_name,
          })
        } catch (err: unknown) {
          for (const i of g.rows) {
            errors.push({
              row: rows[i].row,
              error: err instanceof Error ? err.message : 'Roster check failed',
            })
          }
          continue
        }

        const addedProfileIds: string[] = []
        const toActivate: { member_id: string }[] = []
        for (const i of g.rows) {
          const r = rows[i]
          if (!r.athlete) continue // shouldn't happen — every non-errored row has one
          const result = await addAthleteToTeam(ctx, r.athlete)
          if (!result.ok) {
            errors.push({ row: r.row, error: result.error })
            continue
          }
          const member = result.member as { id: string }
          added.push({
            row: r.row,
            team_name: g.team_name,
            student_id: r.student_id ?? '',
            membership_id: member.id,
            lineup_slot: null,
          })
          addedProfileIds.push(result.profileId)
          if (r.lineup === 'active') toActivate.push({ member_id: member.id })
        }

        if (toActivate.length > 0) {
          // Free slots were already reserved during planning (buildTeamImportPlan),
          // so assign the lowest-numbered slots this team doesn't already occupy.
          const { data: occupiedRows } = await supabase
            .from('team_members')
            .select('lineup_slot')
            .eq('team_id', teamId)
            .not('lineup_slot', 'is', null)
          const used = new Set(
            ((occupiedRows ?? []) as { lineup_slot: number | null }[])
              .map((r) => r.lineup_slot)
              .filter((s): s is number => s != null),
          )
          const free: number[] = []
          for (let s = 1; s <= g.max_active && free.length < toActivate.length; s++) {
            if (!used.has(s)) free.push(s)
          }
          const slotAssignments = toActivate.map((t, i) => ({
            member_id: t.member_id,
            lineup_slot: free[i] ?? null,
          }))
          const lineupResult = await applyLineupSlots(teamId, g.sport, slotAssignments)
          if (!lineupResult.ok) {
            // Shouldn't happen given the planning pass already reserved slots, but
            // don't fail the whole team's import over a lineup-only problem —
            // the players are already on the roster, just left on the bench.
            console.warn('[teams/import] lineup assignment failed:', lineupResult.error)
          } else {
            for (const a of slotAssignments) {
              const row = added.find((x) => x.membership_id === a.member_id)
              if (row) row.lineup_slot = a.lineup_slot
            }
          }
        }

        if (addedProfileIds.length > 0) {
          const teamLabel = g.team_name.trim() || 'your team'
          void insertNotificationsForProfiles(addedProfileIds, {
            type: 'added_to_team',
            title: 'Added to team',
            body: `You were added to ${teamLabel}. Upcoming games will list your matches here; dates appear when your organizer schedules each game.`,
            data: { team_id: teamId },
          }).catch((err) => console.error('notify added_to_team (import):', err))
        }
      }

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'team_rosters_imported',
        entityType: 'team',
        entityId: null,
        details: {
          season_id: body.season_id,
          teams_created: createdTeams.length,
          members_added: added.length,
          error_count: errors.length,
        },
      })

      res.status(errors.length > 0 ? 207 : 201).json({ created_teams: createdTeams, added, errors })
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Import failed' })
    }
  },
)

router.get('/:id', async (req, res) => {
  const idParsed = z.string().uuid().safeParse(req.params.id)
  if (!idParsed.success) return res.status(400).json({ error: 'Invalid team id' })

  const { data, error } = await supabase
    .from('teams')
    .select(teamSelectEmbedded)
    .eq('id', idParsed.data)
    .maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Team not found' })
  res.json(data)
})

router.post('/', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const parsed = teamCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request'
    return res.status(400).json({ error: msg.includes('uuid') ? 'Select a valid season.' : msg })
  }

  try {
    const body = parsed.data
    if (await respondIfSportForbidden(req, res, body.sport)) return

    const { data, error } = await supabase
      .from('teams')
      .insert({
        name: body.name.trim(),
        sport: body.sport,
        season_id: body.season_id,
        captain_id: body.captain_id,
        department: body.department ?? null,
      })
      .select()
      .single()
    if (error)
      return res
        .status(error.message.includes('violates foreign key') ? 400 : 500)
        .json({ error: error.message })

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_created',
      entityType: 'team',
      entityId: data.id,
      details: { name: body.name, sport: body.sport, season_id: body.season_id },
    })

    res.status(201).json(data)
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create failed' })
  }
})

router.patch(
  '/:id',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const teamId = z.string().uuid().safeParse(req.params.id)
    if (!teamId.success) return res.status(400).json({ error: 'Invalid team id' })

    const parsed = teamPatchSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid request'
      return res
        .status(400)
        .json({ error: msg.includes('uuid') ? 'Invalid season or captain id.' : msg })
    }

    const { data: existingTeam } = await supabase
      .from('teams')
      .select('sport')
      .eq('id', teamId.data)
      .maybeSingle()
    if (!existingTeam) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, existingTeam.sport as string)) return

    const updates: Record<string, unknown> = {}
    const body = parsed.data
    if (body.name !== undefined) updates.name = body.name.trim()

    let sportChanging = false
    if (body.sport !== undefined) {
      if (await respondIfSportForbidden(req, res, body.sport)) return
      if (body.sport !== existingTeam.sport) {
        // Changing sport with an existing roster used to be unvalidated — a team
        // could switch sports with players registered for the OLD sport still
        // attached, or with more players than the NEW sport's roster cap allows.
        // (It's also the most likely real-world cause of a team showing more
        // active players than its sport allows: fill a volleyball roster with
        // 6 active, then switch the team to basketball — see migration 062.)
        const { data: rosterRows, error: rosterErr } = await supabase
          .from('team_members')
          .select('id, athlete:athletes(sport)')
          .eq('team_id', teamId.data)
        if (rosterErr) return res.status(500).json({ error: rosterErr.message })

        const rows = (rosterRows ?? []) as { id: string; athlete?: { sport?: string } | null }[]
        const mismatched = rows.filter((r) => r.athlete?.sport && r.athlete.sport !== body.sport)
        if (mismatched.length > 0) {
          return res.status(400).json({
            error: `${mismatched.length} player(s) on this roster are registered for ${existingTeam.sport}. Remove them before switching this team to ${body.sport}.`,
          })
        }

        const maxRoster = getMaxRoster(body.sport)
        if (rows.length > maxRoster) {
          return res.status(400).json({
            error: `Cannot switch to ${body.sport}: this team has ${rows.length} players, over the ${maxRoster}-player limit for ${body.sport}. Remove ${rows.length - maxRoster} first.`,
          })
        }

        sportChanging = true
      }
      updates.sport = body.sport
    }

    if (body.season_id !== undefined) updates.season_id = body.season_id
    if (body.captain_id !== undefined) updates.captain_id = body.captain_id
    if (body.department !== undefined) updates.department = body.department
    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: 'No valid fields to update' })

    if (typeof updates.captain_id === 'string') {
      const { data: member } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', teamId.data)
        .eq('athlete_id', updates.captain_id)
        .maybeSingle()
      if (!member) return res.status(400).json({ error: 'Captain must be a member of this team' })
    }

    const { data, error } = await supabase
      .from('teams')
      .update(updates)
      .eq('id', teamId.data)
      .select()
      .single()
    if (error)
      return res
        .status(error.message.includes('violates foreign key') ? 400 : 500)
        .json({ error: error.message })

    // The roster's sport-match and size are now guaranteed by the checks above,
    // but the ACTIVE lineup can still be over the new sport's (possibly smaller)
    // cap — e.g. 6 active on volleyball, switched to basketball's cap of 5.
    // Benching is reversible, so this auto-fixes rather than refusing the whole
    // sport change.
    let lineupNormalized = 0
    if (sportChanging) {
      lineupNormalized = await normalizeTeamLineup(teamId.data, body.sport as string)
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_updated',
      entityType: 'team',
      entityId: teamId.data,
      details: { fields: Object.keys(updates), lineup_normalized: lineupNormalized || undefined },
    })

    res.json({ ...data, lineup_normalized: lineupNormalized })
  },
)

router.delete(
  '/:id',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.id)
    if (!idParsed.success) return res.status(400).json({ error: 'Invalid team id' })

    const { data: team } = await supabase
      .from('teams')
      .select('name, sport')
      .eq('id', idParsed.data)
      .maybeSingle()
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, team.sport as string)) return

    const { count, error: cErr } = await supabase
      .from('event_participants')
      .select('*', { count: 'exact', head: true })
      .eq('participant_id', idParsed.data)
      .eq('participant_type', 'team')
    if (cErr) return res.status(500).json({ error: cErr.message })
    if ((count ?? 0) > 0)
      return res.status(409).json({ error: 'Remove this team from all events before deleting.' })

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_deleted',
      entityType: 'team',
      entityId: idParsed.data,
      // The team row is gone right after this, so the Audit Logs screen can never
      // look its name back up later — capture it now, same as every *_created action does.
      details: { name: team.name, sport: team.sport },
    })

    const { error } = await supabase.from('teams').delete().eq('id', idParsed.data)
    if (error) return res.status(500).json({ error: error.message })
    res.status(204).send()
  },
)

router.post(
  '/:id/members',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const teamId = z.string().uuid().parse(req.params.id)
    const parsed = z.object({ athlete_id: z.string().uuid() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Provide athlete_id.' })

    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .select('id, sport, season_id, name')
      .eq('id', teamId)
      .maybeSingle()
    if (teamErr) return res.status(500).json({ error: teamErr.message })
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, team.sport as string)) return

    const { data: athlete, error: athleteErr } = await supabase
      .from('athletes')
      .select('id, sport, season_status, profile_id')
      .eq('id', parsed.data.athlete_id)
      .maybeSingle()
    if (athleteErr) return res.status(500).json({ error: athleteErr.message })
    if (!athlete) return res.status(400).json({ error: 'Athlete not found' })

    let ctx
    try {
      ctx = await loadTeamRosterContext(team as { id: string; sport: string; season_id: string; name: string })
    } catch (err: unknown) {
      return res
        .status(500)
        .json({ error: err instanceof Error ? err.message : 'Roster check failed' })
    }

    const result = await addAthleteToTeam(ctx, athlete)
    if (!result.ok) return res.status(result.status).json({ error: result.error })

    const teamLabel = String(team.name ?? 'your team').trim() || 'your team'
    void insertNotificationsForProfiles([result.profileId], {
      type: 'added_to_team',
      title: 'Added to team',
      body: `You were added to ${teamLabel}. Upcoming games will list your matches here; dates appear when your organizer schedules each game.`,
      data: { team_id: teamId },
    }).catch((err) => console.error('notify added_to_team:', err))

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_member_added',
      entityType: 'team_member',
      entityId: (result.member as { id: string }).id,
      details: { team_id: teamId, athlete_id: athlete.id },
    })

    res.status(201).json(result.member)
  },
)

router.delete(
  '/:id/members/:membershipId',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const teamId = z.string().uuid().parse(req.params.id)
    const membershipId = z.string().uuid().parse(req.params.membershipId)

    const { data: team } = await supabase
      .from('teams')
      .select('sport')
      .eq('id', teamId)
      .maybeSingle()
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, team.sport as string)) return

    const { data: row } = await supabase
      .from('team_members')
      .select('id, athlete_id')
      .eq('id', membershipId)
      .eq('team_id', teamId)
      .maybeSingle()
    if (!row) return res.status(404).json({ error: 'Roster membership not found' })

    await supabase.from('team_members').delete().eq('id', membershipId)
    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_member_removed',
      entityType: 'team_member',
      entityId: membershipId,
      details: { team_id: teamId, athlete_id: row.athlete_id },
    })

    res.json({ success: true })
  },
)

router.post(
  '/:id/members/bulk-remove',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const teamId = z.string().uuid().parse(req.params.id)
    const parsed = z
      .object({ membership_ids: z.array(z.string().uuid()).min(1).max(100) })
      .safeParse(req.body)
    if (!parsed.success)
      return res.status(400).json({ error: 'Provide membership_ids (1-100 UUIDs).' })

    const { data: team } = await supabase
      .from('teams')
      .select('sport')
      .eq('id', teamId)
      .maybeSingle()
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, team.sport as string)) return

    const ids = parsed.data.membership_ids
    const { data: rows, error } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .in('id', ids)
    if (error) return res.status(500).json({ error: error.message })
    const existingIds = new Set((rows ?? []).map((r: { id: string }) => r.id))
    if (existingIds.size !== ids.length)
      return res.status(400).json({ error: 'One or more roster rows are not on this team.' })

    const { error: delErr } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .in('id', ids)
    if (delErr) return res.status(500).json({ error: delErr.message })

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_members_bulk_removed',
      entityType: 'team',
      entityId: teamId,
      details: { removed_count: ids.length },
    })
    res.json({ success: true, removed: ids.length })
  },
)

router.post(
  '/:id/coach',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .select('sport')
      .eq('id', req.params.id)
      .maybeSingle()
    if (teamErr) return res.status(500).json({ error: teamErr.message })
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, team.sport as string)) return

    const { data: staff } = await supabase
      .from('organizers')
      .select('id')
      .eq('profile_id', req.user!.id)
      .maybeSingle()
    if (!staff) return res.status(404).json({ error: 'Staff profile not found' })

    const { data, error } = await supabase
      .from('team_coaches')
      .insert({ organizer_id: staff.id, team_id: req.params.id })
      .select()
      .single()
    if (error) return res.status(400).json({ error: error.message })

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_coach_assigned',
      entityType: 'team_coach',
      entityId: data.id,
      details: { team_id: req.params.id, organizer_id: staff.id },
    })

    res.status(201).json(data)
  },
)

router.delete(
  '/:id/coach',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const { data: team } = await supabase
      .from('teams')
      .select('sport')
      .eq('id', req.params.id)
      .maybeSingle()
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, team.sport as string)) return

    const { data: staff } = await supabase
      .from('organizers')
      .select('id')
      .eq('profile_id', req.user!.id)
      .maybeSingle()
    if (!staff) return res.status(404).json({ error: 'Staff profile not found' })

    await supabase
      .from('team_coaches')
      .delete()
      .eq('organizer_id', staff.id)
      .eq('team_id', req.params.id)
    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_coach_removed',
      entityType: 'team',
      entityId: req.params.id,
      details: { organizer_id: staff.id },
    })

    res.json({ success: true })
  },
)

router.patch(
  '/:id/lineup',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const teamId = z.string().uuid().parse(req.params.id)
    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .select('id, sport, name')
      .eq('id', teamId)
      .maybeSingle()
    if (teamErr) return res.status(500).json({ error: teamErr.message })
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (await respondIfSportForbidden(req, res, team.sport as string)) return

    const parsed = z
      .object({
        slots: z.array(
          z.object({
            member_id: z.string().uuid(),
            lineup_slot: z.number().int().min(1).nullable(),
          }),
        ),
      })
      .safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' })

    const memberIds = parsed.data.slots.map((s) => s.member_id)
    const { data: beforeRows } = await supabase
      .from('team_members')
      .select('id, lineup_slot, athlete:athletes(profile_id)')
      .eq('team_id', teamId)
      .in('id', memberIds)

    const beforeMap = new Map<string, number | null>()
    for (const row of beforeRows ?? [])
      beforeMap.set((row as { id: string; lineup_slot: number | null }).id, row.lineup_slot ?? null)

    // applyLineupSlots validates the RESULTING active set (existing rows merged
    // with this request), not just this request in isolation, and commits
    // atomically — see apps/server/src/services/teamRoster.ts.
    const result = await applyLineupSlots(teamId, team.sport as string, parsed.data.slots)
    if (!result.ok) return res.status(400).json({ error: result.error })

    const { data: afterRows } = await supabase
      .from('team_members')
      .select('id, lineup_slot, athlete:athletes(profile_id)')
      .eq('team_id', teamId)
      .in('id', memberIds)

    const teamLabel = String(team.name ?? 'your team').trim() || 'your team'
    for (const row of afterRows ?? []) {
      const r = row as {
        id: string
        lineup_slot: number | null
        athlete?: { profile_id?: string | null } | null
      }
      if (!beforeMap.has(r.id)) continue
      const prev = beforeMap.get(r.id) ?? null
      const cur = r.lineup_slot ?? null
      if (prev === cur || !r.athlete?.profile_id) continue

      const body =
        prev === null && cur !== null
          ? `You're in the starting lineup for ${teamLabel} (slot ${cur}).`
          : prev !== null && cur === null
            ? `You were moved to the bench for ${teamLabel}.`
            : `Your lineup assignment was updated for ${teamLabel}.`

      void insertNotificationsForProfiles([r.athlete.profile_id], {
        type: 'lineup_updated',
        title: 'Lineup update',
        body,
        data: { team_id: teamId, team_member_id: r.id },
      }).catch((err) => console.error('notify lineup:', err))
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'team_lineup_updated',
      entityType: 'team',
      entityId: teamId,
      details: { slot_updates: parsed.data.slots.length },
    })

    res.json({ success: true })
  },
)

export default router
