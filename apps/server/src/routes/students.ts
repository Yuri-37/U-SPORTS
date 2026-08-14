import { Router } from 'express'
import ExcelJS from 'exceljs'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { XLSX_MIME, spreadsheetUpload, parseUploadedRows } from '../utils/spreadsheetImport'
import { createAthleteAuthUser, inviteEmailsEnabled } from '../utils/accountEmail'
import { generatedEmail, generatedPassword } from '../utils/studentAccounts'

const router = Router()

const upload = spreadsheetUpload

const departmentEnum = z.enum(['SBMA', 'SECA', 'SASE', 'SHS'])
const sportEnum = z.enum(['basketball', 'volleyball', 'table-tennis'])

const importRowSchema = z.object({
  full_name: z.string().trim().min(1),
  student_id: z.string().trim().min(1),
  year_level: z.string().trim().optional().default(''),
  course: z.string().trim().optional().default(''),
  department: departmentEnum,
  sport: sportEnum.optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).optional(),
})

function normalizeImportRow(row: Record<string, unknown>) {
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
  return {
    full_name: lowered.get('full_name') ?? lowered.get('name'),
    student_id: lowered.get('student_id') ?? lowered.get('school_id') ?? lowered.get('id_number'),
    year_level: lowered.get('year_level') ?? lowered.get('year'),
    course: lowered.get('course'),
    department: String(lowered.get('department') ?? '')
      .trim()
      .toUpperCase(),
    sport: lowered.get('sport'),
    email: lowered.get('email'),
    password: lowered.get('password'),
  }
}

router.post(
  '/import',
  requireAuth,
  requireRole('Coach', 'Admin'),
  upload.single('file'),
  async (req: AuthRequest, res) => {
    const bodySchema = z.object({
      sport: sportEnum.optional(),
      rows: z.union([z.array(z.record(z.unknown())), z.string()]).optional(),
    })

    try {
      const body = bodySchema.parse(req.body)
      let rawRows: Record<string, unknown>[] = Array.isArray(body.rows) ? body.rows : []

      if (req.file?.buffer) {
        rawRows = await parseUploadedRows(req.file)
      } else if (typeof body.rows === 'string') {
        rawRows = JSON.parse(body.rows) as Record<string, unknown>[]
      }

      if (rawRows.length === 0) {
        return res.status(400).json({ error: 'Upload a CSV or Excel file, or provide rows.' })
      }

      const created: Array<{
        student_id: string
        email: string
        athlete_id: string
        tempPassword?: string
      }> = []
      const errors: Array<{ row: number; error: string }> = []

      for (const [idx, raw] of rawRows.entries()) {
        const normalized = normalizeImportRow(raw)
        const parsed = importRowSchema.safeParse({
          ...normalized,
          sport: normalized.sport || body.sport,
        })
        if (!parsed.success) {
          errors.push({ row: idx + 1, error: parsed.error.issues[0]?.message ?? 'Invalid row' })
          continue
        }

        const row = parsed.data
        if (!row.sport) {
          errors.push({
            row: idx + 1,
            error: 'Sport is required either in the file row or request body.',
          })
          continue
        }
        const email = (row.email ?? generatedEmail(row.student_id)).toLowerCase()
        const password = row.password ?? generatedPassword(row.student_id)

        const { data: existingAthlete } = await supabase
          .from('athletes')
          .select('id')
          .eq('student_id', row.student_id)
          .maybeSingle()
        if (existingAthlete) {
          errors.push({ row: idx + 1, error: `Student ID ${row.student_id} already exists.` })
          continue
        }

        let userId: string
        let mode: 'invited' | 'password'
        try {
          const account = await createAthleteAuthUser({
            email,
            password,
            fullName: row.full_name,
            studentId: row.student_id,
            department: row.department,
            course: row.course,
            yearLevel: row.year_level,
          })
          userId = account.userId
          mode = account.mode
        } catch (e: unknown) {
          errors.push({ row: idx + 1, error: e instanceof Error ? e.message : 'Could not create auth user' })
          continue
        }

        const { error: profileError } = await supabase.from('profiles').upsert({
          id: userId,
          email,
          full_name: row.full_name,
          role: null,
          department: row.department,
        })
        if (profileError) {
          errors.push({ row: idx + 1, error: profileError.message })
          continue
        }

        const { data: athlete, error: athleteError } = await supabase
          .from('athletes')
          .insert({
            profile_id: userId,
            student_id: row.student_id,
            sport: row.sport,
            year_level: row.year_level,
            department: row.department,
            season_status: 'active',
          })
          .select('id')
          .single()
        if (athleteError || !athlete) {
          errors.push({
            row: idx + 1,
            error: athleteError?.message ?? 'Could not create athlete row',
          })
          continue
        }

        created.push({
          student_id: row.student_id,
          email,
          athlete_id: athlete.id,
          // Only meaningful in 'password' mode -- the invited path never
          // sets a password server-side, the invitee picks their own.
          ...(mode === 'password' ? { tempPassword: password } : {}),
        })
      }

      await supabase.from('audit_logs').insert({
        actor_id: req.user!.id,
        action: 'athletes_imported',
        entity_type: 'athlete',
        entity_id: null,
        details: { created_count: created.length, error_count: errors.length },
      })

      res.status(errors.length > 0 ? 207 : 201).json({
        created,
        errors,
        invited: inviteEmailsEnabled(),
      })
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Import failed' })
    }
  },
)

/**
 * Parses and validates a file the same way `/import` does, but never creates
 * auth users or athlete rows — lets the UI show a preview before committing.
 */
router.post(
  '/import/preview',
  requireAuth,
  requireRole('Coach', 'Admin'),
  upload.single('file'),
  async (req: AuthRequest, res) => {
    const bodySchema = z.object({
      sport: sportEnum.optional(),
      rows: z.union([z.array(z.record(z.unknown())), z.string()]).optional(),
    })

    try {
      const body = bodySchema.parse(req.body)
      let rawRows: Record<string, unknown>[] = Array.isArray(body.rows) ? body.rows : []

      if (req.file?.buffer) {
        rawRows = await parseUploadedRows(req.file)
      } else if (typeof body.rows === 'string') {
        rawRows = JSON.parse(body.rows) as Record<string, unknown>[]
      }

      if (rawRows.length === 0) {
        return res.status(400).json({ error: 'Upload a CSV or Excel file, or provide rows.' })
      }

      const seenStudentIds = new Set<string>()
      const preview: Array<{
        row: number
        valid: boolean
        error?: string
        full_name?: string
        student_id?: string
        department?: string
        sport?: string
        year_level?: string
        course?: string
        email?: string
        password?: string
      }> = []

      for (const [idx, raw] of rawRows.entries()) {
        const normalized = normalizeImportRow(raw)
        const parsed = importRowSchema.safeParse({
          ...normalized,
          sport: normalized.sport || body.sport,
        })
        if (!parsed.success) {
          preview.push({
            row: idx + 1,
            valid: false,
            error: parsed.error.issues[0]?.message ?? 'Invalid row',
            full_name: normalized.full_name ? String(normalized.full_name) : undefined,
            student_id: normalized.student_id ? String(normalized.student_id) : undefined,
            department: normalized.department || undefined,
            sport: normalized.sport ? String(normalized.sport) : undefined,
            year_level: normalized.year_level ? String(normalized.year_level) : undefined,
            course: normalized.course ? String(normalized.course) : undefined,
          })
          continue
        }

        const row = parsed.data
        const common = {
          full_name: row.full_name,
          student_id: row.student_id,
          department: row.department,
          sport: row.sport,
          year_level: row.year_level,
          course: row.course,
        }

        if (!row.sport) {
          preview.push({
            row: idx + 1,
            valid: false,
            error: 'Sport is required either in the file row or request body.',
            ...common,
          })
          continue
        }

        if (seenStudentIds.has(row.student_id)) {
          preview.push({
            row: idx + 1,
            valid: false,
            error: `Student ID ${row.student_id} is duplicated within this file.`,
            ...common,
          })
          continue
        }
        seenStudentIds.add(row.student_id)

        const email = (row.email ?? generatedEmail(row.student_id)).toLowerCase()
        const password = row.password ?? generatedPassword(row.student_id)

        const { data: existingAthlete } = await supabase
          .from('athletes')
          .select('id')
          .eq('student_id', row.student_id)
          .maybeSingle()
        if (existingAthlete) {
          preview.push({
            row: idx + 1,
            valid: false,
            error: `Student ID ${row.student_id} already exists.`,
            ...common,
            email,
          })
          continue
        }

        preview.push({ row: idx + 1, valid: true, ...common, email, password })
      }

      const validCount = preview.filter((p) => p.valid).length
      res.json({ rows: preview, validCount, invalidCount: preview.length - validCount })
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not preview file' })
    }
  },
)

router.get(
  '/import-template',
  requireAuth,
  requireRole('Coach', 'Admin'),
  async (_req: AuthRequest, res) => {
    try {
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Athletes')

      ws.columns = [
        { header: 'full_name', key: 'full_name', width: 26 },
        { header: 'student_id', key: 'student_id', width: 16 },
        { header: 'department', key: 'department', width: 14 },
        { header: 'sport', key: 'sport', width: 16 },
        { header: 'year_level', key: 'year_level', width: 14 },
        { header: 'course', key: 'course', width: 14 },
        { header: 'email', key: 'email', width: 32 },
        { header: 'password', key: 'password', width: 22 },
      ]

      // Bold header row.
      ws.getRow(1).font = { bold: true }

      // Keep student_id as text so IDs aren't coerced to numbers.
      ws.getColumn('student_id').numFmt = '@'

      // Example row to show the expected format.
      ws.addRow({
        full_name: 'Juan Dela Cruz',
        student_id: '2024-1001',
        department: 'SECA',
        sport: 'basketball',
        year_level: '1st Year',
        course: 'BSIT',
        email: '',
        password: '',
      })

      // Dropdown validation for the enum columns (department = col C, sport = col D).
      for (let row = 2; row <= 500; row++) {
        ws.getCell(`C${row}`).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: ['"SBMA,SECA,SASE,SHS"'],
          showErrorMessage: true,
          errorTitle: 'Invalid department',
          error: 'Choose SBMA, SECA, SASE, or SHS.',
        }
        ws.getCell(`D${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"basketball,volleyball,table-tennis"'],
          showErrorMessage: true,
          errorTitle: 'Invalid sport',
          error: 'Choose basketball, volleyball, or table-tennis.',
        }
      }

      const buffer = await wb.xlsx.writeBuffer()
      res.setHeader('Content-Type', XLSX_MIME)
      res.setHeader('Content-Disposition', 'attachment; filename="athletes-import-template.xlsx"')
      res.send(Buffer.from(buffer))
    } catch (err: unknown) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : 'Could not build template' })
    }
  },
)

export default router
