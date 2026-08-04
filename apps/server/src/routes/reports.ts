import { Router, type Response } from 'express'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'
import PDFDocument from 'pdfkit'
import { deriveEliminationPodium } from '../utils/eventPlacements'
import { resolveParticipantLabelMap } from '../utils/participantLabelMap'
import {
  aggregateInsightPlainText,
  buildSeasonAggregateInsights,
} from '../utils/analyticsComputedInsights'
import { getMatchReviewData } from '../services/matchReviewData'
import {
  summarizeFinalScore,
  buildPeriodTable,
  BOX_SCORE_COLUMNS,
  type Sport,
} from '../utils/matchScorePresentation'
import { STAT_LABELS } from '../services/computeInsights'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function titleCase(s: string): string {
  return s
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function safeFilenamePart(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

const router = Router()

// 'insights' moved to its own richer XLSX export — see GET /analytics/insights-xlsx below.
const analyticsTabSchema = z.enum(['leaderboard', 'results', 'teams'])

const analyticsCsvQuerySchema = z.object({
  seasonId: z
    .string()
    .optional()
    .transform((s) => {
      const t = s?.trim()
      return t && t.length > 0 ? t : undefined
    }),
  sport: z.enum(['basketball', 'volleyball', 'table-tennis']).optional(),
  tab: z.preprocess((val) => {
    const v = Array.isArray(val) ? val[0] : val
    if (v === '' || v === undefined || v === null) return 'leaderboard'
    return v
  }, analyticsTabSchema),
})

function csvEscape(cell: unknown): string {
  return `"${String(cell ?? '').replace(/"/g, '""')}"`
}

function sendCsv(
  res: Response,
  filename: string,
  headers: string[],
  rows: Record<string, unknown>[],
) {
  const csv =
    rows.length === 0
      ? headers.join(',')
      : [
          headers.join(','),
          ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(',')),
        ].join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(csv)
}

// Export analytics as CSV (tab-specific; season + optional sport filter)
router.get(
  '/analytics/csv',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const parsed = analyticsCsvQuerySchema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

    let seasonId = parsed.data.seasonId?.trim() ?? ''
    let seasonName = 'season'

    if (!seasonId || seasonId === 'current') {
      const { data: active } = await supabase
        .from('seasons')
        .select('id, name')
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (!active?.id) return res.status(400).json({ error: 'No active season configured.' })
      seasonId = active.id
      seasonName = active.name ?? seasonName
    } else {
      const { data: exists } = await supabase
        .from('seasons')
        .select('id, name')
        .eq('id', seasonId)
        .maybeSingle()
      if (!exists) return res.status(404).json({ error: 'Season not found' })
      seasonName = exists.name ?? seasonName
    }

    const sport = parsed.data.sport
    const tab = parsed.data.tab
    const dateStamp = new Date().toISOString().slice(0, 10)
    const filenamePrefix = `${safeFilenamePart(seasonName)}${sport ? `-${safeFilenamePart(sport)}` : ''}`

    try {
      if (tab === 'leaderboard') {
        let statsQuery = supabase
          .from('player_season_stats')
          .select(
            '*, athlete:athletes(student_id, sport, position, profile:profiles!athletes_profile_id_fkey(full_name))',
          )
          .eq('season_id', seasonId)
          .order('games_played', { ascending: false })

        if (sport) statsQuery = statsQuery.eq('sport', sport)

        const { data: stats, error } = await statsQuery
        if (error) return res.status(500).json({ error: error.message })

        const rows = (stats ?? []).map((s: any) => {
          const athlete = s.athlete
          return {
            student_id: athlete?.student_id ?? '',
            full_name: athlete?.profile?.full_name ?? '',
            sport: s.sport,
            position: athlete?.position ?? '',
            games_played: s.games_played,
            ...s.stats,
          }
        })

        const defaultHeaders = ['student_id', 'full_name', 'sport', 'position', 'games_played']
        const headers = rows.length > 0 ? Object.keys(rows[0]) : defaultHeaders
        await writeAuditLog({
          actorId: req.user!.id,
          action: 'analytics_csv_exported',
          entityType: 'season',
          entityId: seasonId,
          details: { tab: 'leaderboard', sport: sport ?? null },
        })
        sendCsv(
          res,
          `${filenamePrefix}-leaderboard-${dateStamp}.csv`,
          headers,
          rows as Record<string, unknown>[],
        )
        return
      }

      if (tab === 'teams') {
        const { data: raw, error } = await supabase
          .from('team_season_stats')
          .select('wins, losses, team:teams(name, sport)')
          .eq('season_id', seasonId)
          .order('wins', { ascending: false })

        if (error) return res.status(500).json({ error: error.message })

        let list = raw ?? []
        if (sport) list = list.filter((ts: any) => ts.team?.sport === sport)

        const rows = list.map((ts: any) => {
          const gp = (ts.wins ?? 0) + (ts.losses ?? 0)
          const pct = gp > 0 ? Math.round((ts.wins / gp) * 100) : 0
          return {
            team_name: ts.team?.name ?? '',
            sport: ts.team?.sport ?? '',
            wins: ts.wins ?? 0,
            losses: ts.losses ?? 0,
            games_decided: gp,
            win_pct: pct,
          }
        })

        await writeAuditLog({
          actorId: req.user!.id,
          action: 'analytics_csv_exported',
          entityType: 'season',
          entityId: seasonId,
          details: { tab: 'teams', sport: sport ?? null },
        })
        sendCsv(
          res,
          `${filenamePrefix}-teams-${dateStamp}.csv`,
          ['team_name', 'sport', 'wins', 'losses', 'games_decided', 'win_pct'],
          rows,
        )
        return
      }

      // tab === 'results'
      let evQuery = supabase
        .from('events')
        .select('id,name')
        .eq('season_id', seasonId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(80)

      if (sport) evQuery = evQuery.eq('sport', sport)

      const { data: doneEv, error: evErr } = await evQuery
      if (evErr) return res.status(500).json({ error: evErr.message })

      const rows: Record<string, unknown>[] = []
      const idsForLabels = new Set<string>()

      for (const ev of doneEv ?? []) {
        const { data: br } = await supabase
          .from('brackets')
          .select(
            'round,match_order,participant_a_id,participant_b_id,winner_id,is_bye,bracket_type',
          )
          .eq('event_id', ev.id)

        const placements = deriveEliminationPodium(
          (br ?? []) as Parameters<typeof deriveEliminationPodium>[0],
        )
        if (!placements) continue

        const champ = placements.find((p) => p.rank === 1)
        const runner = placements.find((p) => p.rank === 2)
        if (champ) idsForLabels.add(champ.participantId)
        if (runner) idsForLabels.add(runner.participantId)

        rows.push({
          event_name: ev.name ?? '',
          champion_participant_id: champ?.participantId ?? '',
          runner_up_participant_id: runner?.participantId ?? '',
        })
      }

      const labelMap = await resolveParticipantLabelMap([...idsForLabels])

      const rowsNamed = rows.map((r) => ({
        event_name: r.event_name,
        champion:
          labelMap[String(r.champion_participant_id)] ?? String(r.champion_participant_id ?? ''),
        runner_up:
          labelMap[String(r.runner_up_participant_id)] ?? String(r.runner_up_participant_id ?? ''),
      }))

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'analytics_csv_exported',
        entityType: 'season',
        entityId: seasonId,
        details: { tab: 'results', sport: sport ?? null },
      })
      sendCsv(
        res,
        `${filenamePrefix}-event-results-${dateStamp}.csv`,
        ['event_name', 'champion', 'runner_up'],
        rowsNamed,
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'CSV export failed'
      res.status(500).json({ error: msg })
    }
  },
)

const insightsXlsxQuerySchema = z.object({
  seasonId: z
    .string()
    .optional()
    .transform((s) => {
      const t = s?.trim()
      return t && t.length > 0 ? t : undefined
    }),
  sport: z.enum(['basketball', 'volleyball', 'table-tennis']),
  filter: z.enum(['all', 'trending', 'debuts', 'team']).optional().default('all'),
})

/** Mirrors INSIGHT_FILTER_GROUPS in apps/web/src/pages/organizer/Analytics.tsx — the
 *  export downloads whatever category is selected on screen, not always everything. */
const INSIGHT_FILTER_GROUPS: Record<string, string[]> = {
  trending: ['trending_up', 'trending_down'],
  debuts: ['debut_standout'],
  team: ['streak', 'first_win'],
}
const FILTER_LABELS: Record<string, string> = {
  all: 'All',
  trending: 'Trending',
  debuts: 'Debuts',
  team: 'Team form',
}

// Export Insights as an Excel workbook — CSV flattened heterogeneous data (season
// snapshots have no entity; automated insights vary in shape by insight_type) into
// one 8-column table with raw entity_id UUIDs and no real numbers, just the prose
// sentence. Instead: a Summary sheet up front (counts + season snapshot highlights,
// always for the whole sport regardless of filter) and a detail sheet scoped to
// whichever category was selected, with ids resolved to names and the supporting
// numbers (season/rolling averages, W-L record) as real columns.
router.get(
  '/analytics/insights-xlsx',
  requireAuth,
  requireRole('Organizer', 'Admin', 'Coach'),
  async (req: AuthRequest, res) => {
    const parsed = insightsXlsxQuerySchema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

    let seasonId = parsed.data.seasonId?.trim() ?? ''
    let seasonName = 'season'

    if (!seasonId || seasonId === 'current') {
      const { data: active } = await supabase
        .from('seasons')
        .select('id, name')
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (!active?.id) return res.status(400).json({ error: 'No active season configured.' })
      seasonId = active.id
      seasonName = active.name ?? seasonName
    } else {
      const { data: exists } = await supabase
        .from('seasons')
        .select('id, name')
        .eq('id', seasonId)
        .maybeSingle()
      if (!exists) return res.status(404).json({ error: 'Season not found' })
      seasonName = exists.name ?? seasonName
    }

    const { sport, filter } = parsed.data

    try {
      const [lbRes, tsRes] = await Promise.all([
        supabase
          .from('player_season_stats')
          .select(
            '*, athlete:athletes(student_id, profile:profiles!athletes_profile_id_fkey(full_name))',
          )
          .eq('season_id', seasonId)
          .eq('sport', sport)
          .order('games_played', { ascending: false })
          .limit(80),
        supabase
          .from('team_season_stats')
          .select('*, team:teams(name, sport)')
          .eq('season_id', seasonId),
      ])
      if (lbRes.error) return res.status(500).json({ error: lbRes.error.message })
      if (tsRes.error) return res.status(500).json({ error: tsRes.error.message })

      const snapshots = buildSeasonAggregateInsights(
        sport,
        (lbRes.data ?? []) as any,
        (tsRes.data ?? []) as any,
      )

      const { data: insightRows, error: iqErr } = await supabase
        .from('insights')
        .select('entity_type, entity_id, sport, insight_type, insight_text, data, created_at')
        .eq('season_id', seasonId)
        .eq('sport', sport)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(500)
      if (iqErr) return res.status(500).json({ error: iqErr.message })

      const allRows = insightRows ?? []
      // Detail sheet is scoped to the selected category; the Summary counts below
      // always reflect the whole sport so the "overall" picture isn't lost to a filter.
      const rows =
        filter === 'all'
          ? allRows
          : allRows.filter((r) => INSIGHT_FILTER_GROUPS[filter]?.includes(r.insight_type))

      // Entity ids AND any opponent id tucked inside `data` (first_win insights) — one
      // batch resolution instead of a lookup per row.
      const idsToResolve = new Set<string>()
      for (const r of allRows) {
        if (r.entity_id) idsToResolve.add(r.entity_id)
        const d = (r.data ?? {}) as Record<string, unknown>
        if (typeof d.opponent_id === 'string') idsToResolve.add(d.opponent_id)
      }
      const labels = await resolveParticipantLabelMap([...idsToResolve])

      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'U-Sports'
      workbook.created = new Date()

      const counts = {
        total: allRows.length,
        debuts: allRows.filter((r) => r.insight_type === 'debut_standout').length,
        trendingUp: allRows.filter((r) => r.insight_type === 'trending_up').length,
        trendingDown: allRows.filter((r) => r.insight_type === 'trending_down').length,
        team: allRows.filter((r) => r.insight_type === 'streak' || r.insight_type === 'first_win')
          .length,
      }

      const summarySheet = workbook.addWorksheet('Summary')
      summarySheet.columns = [
        { key: 'label', width: 32 },
        { key: 'value', width: 70 },
      ]
      summarySheet.addRow([`${seasonName} — ${titleCase(sport)} Insights Summary`]).font = {
        bold: true,
        size: 14,
      }
      summarySheet.addRow([`Generated: ${new Date().toLocaleDateString('en-PH')}`])
      if (filter !== 'all')
        summarySheet.addRow([`Detail sheet filtered to: ${FILTER_LABELS[filter]}`]).font = {
          italic: true,
        }
      summarySheet.addRow([])
      summarySheet.addRow(['Overview (whole sport, regardless of filter)']).font = { bold: true }
      // A real header row here (not just loose label/value pairs) so tools like Excel's
      // "Analyze Data" pick up "Metric"/"Count" instead of guessing "Field1"/"Field2".
      summarySheet.addRow(['Metric', 'Count']).font = { bold: true }
      summarySheet.addRow(['Total automated insights', counts.total])
      summarySheet.addRow(['Debut standouts', counts.debuts])
      summarySheet.addRow(['Trending up', counts.trendingUp])
      summarySheet.addRow(['Trending down', counts.trendingDown])
      summarySheet.addRow(['Team form (streaks / wins)', counts.team])
      summarySheet.addRow([])
      summarySheet.addRow(['Season snapshots (top storylines)']).font = { bold: true }
      if (snapshots.length === 0) {
        summarySheet.addRow(['Need more logged games before narratives appear.'])
      } else {
        for (const s of snapshots) summarySheet.addRow([aggregateInsightPlainText(s)])
      }

      const aiSheetName =
        filter === 'all' ? 'Automated Insights' : `Automated Insights — ${FILTER_LABELS[filter]}`
      const aiSheet = workbook.addWorksheet(aiSheetName)
      aiSheet.columns = [
        { header: 'Type', key: 'entity_type', width: 8 },
        { header: 'Name', key: 'entity_name', width: 26 },
        { header: 'Sport', key: 'sport', width: 14 },
        { header: 'Insight Type', key: 'insight_type', width: 16 },
        { header: 'Insight', key: 'insight_text', width: 70 },
        { header: 'Stat', key: 'stat', width: 10 },
        { header: 'Value', key: 'value', width: 8 },
        { header: 'Season Avg', key: 'season_avg', width: 12 },
        { header: 'Last 3 Avg', key: 'rolling_avg', width: 12 },
        { header: 'Change %', key: 'delta_pct', width: 10 },
        { header: 'Record (W-L)', key: 'record', width: 12 },
        { header: 'Streak', key: 'streak', width: 8 },
        { header: 'Opponent', key: 'opponent', width: 26 },
        { header: 'Date', key: 'created_at', width: 14 },
      ]
      aiSheet.getRow(1).font = { bold: true }

      for (const row of rows) {
        const d = (row.data ?? {}) as Record<string, unknown>
        const wins = typeof d.wins === 'number' ? d.wins : undefined
        const losses = typeof d.losses === 'number' ? d.losses : undefined
        const excelRow = aiSheet.addRow({
          entity_type: titleCase(row.entity_type),
          entity_name: labels[row.entity_id] ?? row.entity_id,
          sport: row.sport,
          insight_type: titleCase(row.insight_type),
          insight_text: row.insight_text,
          stat: typeof d.stat_key === 'string' ? (STAT_LABELS[d.stat_key] ?? d.stat_key) : '',
          value: typeof d.value === 'number' ? d.value : '',
          season_avg: typeof d.season_avg === 'number' ? Number(d.season_avg.toFixed(2)) : '',
          rolling_avg: typeof d.rolling_avg === 'number' ? Number(d.rolling_avg.toFixed(2)) : '',
          delta_pct: typeof d.delta_pct === 'number' ? d.delta_pct : '',
          record: wins != null && losses != null ? `${wins}-${losses}` : '',
          streak: typeof d.streak === 'number' ? d.streak : '',
          opponent: typeof d.opponent_id === 'string' ? (labels[d.opponent_id] ?? '') : '',
          created_at: row.created_at ? new Date(row.created_at).toLocaleDateString('en-PH') : '',
        })
        if (row.insight_type === 'trending_up')
          excelRow.getCell('insight_type').font = { bold: true, color: { argb: 'FF16A34A' } }
        if (row.insight_type === 'trending_down')
          excelRow.getCell('insight_type').font = { bold: true, color: { argb: 'FFDC2626' } }
      }
      if (rows.length === 0) {
        aiSheet.addRow({
          insight_text:
            filter === 'all'
              ? 'No automated insights for this season/sport yet.'
              : `No ${FILTER_LABELS[filter].toLowerCase()} insights for this season/sport yet.`,
        })
      }

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'analytics_insights_xlsx_exported',
        entityType: 'season',
        entityId: seasonId,
        details: { sport, filter },
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const dateStamp = new Date().toISOString().slice(0, 10)
      const filterSuffix = filter === 'all' ? '' : `-${filter}`
      const filename = `${safeFilenamePart(seasonName)}-${safeFilenamePart(sport)}-insights${filterSuffix}-${dateStamp}.xlsx`
      res.setHeader('Content-Type', XLSX_MIME)
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.send(Buffer.from(buffer))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Insights export failed'
      res.status(500).json({ error: msg })
    }
  },
)

// Generate season report PDF
router.get(
  '/season/:seasonId/pdf',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const { data: season } = await supabase
      .from('seasons')
      .select('*')
      .eq('id', req.params.seasonId)
      .single()
    if (!season) return res.status(404).json({ error: 'Season not found' })

    const { data: institution } = await supabase
      .from('institution')
      .select('name, abbreviation, tagline')
      .single()

    const { data: topPlayers } = await supabase
      .from('player_season_stats')
      .select(
        '*, athlete:athletes(student_id, sport, profile:profiles!athletes_profile_id_fkey(full_name))',
      )
      .eq('season_id', req.params.seasonId)
      .order('games_played', { ascending: false })
      .limit(10)

    const { data: teamStats } = await supabase
      .from('team_season_stats')
      .select('*, team:teams(name, sport)')
      .eq('season_id', req.params.seasonId)
      .order('wins', { ascending: false })

    const doc = new PDFDocument({ margin: 50 })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${season.name}-report.pdf"`)

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'season_pdf_report_exported',
      entityType: 'season',
      entityId: req.params.seasonId,
      details: { season_name: season.name },
    })

    doc.pipe(res)

    // Header
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text(institution?.name ?? 'U-Sports', { align: 'center' })
    doc
      .fontSize(14)
      .font('Helvetica')
      .text(institution?.tagline ?? '', { align: 'center' })
    doc.moveDown()
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(`Season Report: ${season.name}`, { align: 'center' })
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Generated: ${new Date().toLocaleDateString('en-PH')}`, { align: 'center' })
    doc.moveDown(2)

    // Team standings
    if (teamStats && teamStats.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Team Standings')
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
      doc.moveDown(0.5)
      teamStats.forEach((ts: any, i: number) => {
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(
            `${i + 1}. ${ts.team?.name ?? 'Team'} (${ts.team?.sport}) — W${ts.wins} L${ts.losses}`,
          )
      })
      doc.moveDown()
    }

    // Top performers
    if (topPlayers && topPlayers.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Top Performers')
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
      doc.moveDown(0.5)
      topPlayers.forEach((p: any, i: number) => {
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(
            `${i + 1}. ${p.athlete?.profile?.full_name ?? 'Player'} (${p.sport}) — ${p.games_played} GP`,
          )
      })
    }

    doc.end()
  },
)

/** Draws a bordered "Team | period columns | FINAL" grid — the classic printed
 *  score sheet's box score layout — since PDFKit has no built-in table support. */
function drawScoreGrid(
  doc: PDFKit.PDFDocument,
  columnLabels: string[],
  finalLabel: string,
  rows: { label: string; values: number[]; final: number; isWinner: boolean }[],
) {
  const startX = 50
  const tableWidth = 500
  const labelWidth = 140
  const colWidth = (tableWidth - labelWidth) / (columnLabels.length + 1)
  const dataRowHeight = 22
  // Basketball tops out at 8 columns (Q1-Q4 + 3OT + FINAL), table tennis at 8
  // (Game1-7 + GAMES WON) — narrow columns can wrap a multi-word header like
  // "GAMES WON" onto 2 lines, so the header row gets its own taller height and
  // smaller font rather than sharing the data rows' fixed 22pt height.
  const headerRowHeight = 32
  let y = doc.y

  const cell = (x: number, w: number, h: number, text: string, bold: boolean, fontSize: number) => {
    doc.rect(x, y, w, h).stroke()
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(fontSize)
      .text(text, x + 3, y + (h - fontSize) / 2, { width: w - 6, align: 'center' })
  }

  cell(startX, labelWidth, headerRowHeight, 'Team', true, 8)
  columnLabels.forEach((label, i) =>
    cell(startX + labelWidth + i * colWidth, colWidth, headerRowHeight, label, true, 8),
  )
  cell(
    startX + labelWidth + columnLabels.length * colWidth,
    colWidth,
    headerRowHeight,
    finalLabel,
    true,
    8,
  )
  y += headerRowHeight

  for (const row of rows) {
    // Helvetica/WinAnsi has no ✓ glyph — it renders as a mangled stray mark, so use plain ASCII.
    cell(startX, labelWidth, dataRowHeight, row.isWinner ? `${row.label} (W)` : row.label, true, 9)
    row.values.forEach((v, i) =>
      cell(startX + labelWidth + i * colWidth, colWidth, dataRowHeight, String(v), false, 9),
    )
    cell(
      startX + labelWidth + row.values.length * colWidth,
      colWidth,
      dataRowHeight,
      String(row.final),
      true,
      9,
    )
    y += dataRowHeight
  }

  doc.y = y + 10
}

// Generate a match score sheet PDF (header, final score/winner, period-by-period, player box score)
router.get(
  '/match/:matchId/pdf',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const matchId = req.params.matchId as string
    const data = await getMatchReviewData(matchId)
    if (!data) return res.status(404).json({ error: 'Match not found' })
    if (!data.match.finalized_at) {
      return res.status(400).json({ error: 'This match has not been finalized yet' })
    }

    const { data: institution } = await supabase
      .from('institution')
      .select('name, abbreviation, tagline')
      .single()
    const sport = (data.match.event?.sport ?? 'basketball') as Sport
    const scoreA = data.scores.find((s: any) => s.participant_id === data.match.participant_a_id)
    const scoreB = data.scores.find((s: any) => s.participant_id === data.match.participant_b_id)
    const winnerId = data.match.bracket?.winner_id ?? null
    const winnerName =
      winnerId === data.match.participant_a_id
        ? data.participantNames.a
        : winnerId === data.match.participant_b_id
          ? data.participantNames.b
          : null

    const doc = new PDFDocument({ margin: 50 })
    const safe = (s: string) =>
      s
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safe(data.participantNames.a)}-vs-${safe(data.participantNames.b)}-score-sheet.pdf"`,
    )

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'match_score_sheet_pdf_exported',
      entityType: 'match',
      entityId: matchId,
      details: { event_id: data.match.event_id, winner_id: winnerId },
    })

    doc.pipe(res)

    // Header
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text(institution?.name ?? 'U-Sports', { align: 'center' })
    doc
      .fontSize(14)
      .font('Helvetica')
      .text(institution?.tagline ?? '', { align: 'center' })
    doc.moveDown()
    doc.fontSize(18).font('Helvetica-Bold').text('Match Score Sheet', { align: 'center' })
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Generated: ${new Date().toLocaleDateString('en-PH')}`, { align: 'center' })
    doc.moveDown(2)

    // Match details
    doc.fontSize(14).font('Helvetica-Bold').text('Match Details')
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
    doc.moveDown(0.5)
    doc.fontSize(10).font('Helvetica')
    const roundSuffix = data.match.bracket?.round ? ` · Round ${data.match.bracket.round}` : ''
    doc.text(`Event: ${data.match.event?.name ?? '—'}${roundSuffix}`)
    doc.text(`Sport: ${sport}`)
    doc.text(
      `Date: ${data.match.scheduled_at ? new Date(data.match.scheduled_at).toLocaleString('en-PH') : '—'}`,
    )
    doc.text(`Venue: ${data.match.venue ?? '—'}`)
    doc.text(`Scorer: ${data.scorerName ?? '—'}`)
    doc.moveDown()

    // Score — mirrors the classic printed score sheet's boxed "Team | Q1..Q4 | FINAL" grid
    doc.fontSize(14).font('Helvetica-Bold').text('Score')
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
    doc.moveDown(0.5)
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(
        `${data.participantNames.a} ${summarizeFinalScore(sport, scoreA, scoreB)} ${data.participantNames.b}`,
        { align: 'center' },
      )
    doc.moveDown(0.5)

    const periods = buildPeriodTable(sport, scoreA, scoreB)
    // For volleyball/table-tennis, "FINAL" is sets/games won — what actually decides
    // the match — not a meaningless point total across sets.
    const finalColumnLabel =
      sport === 'volleyball' ? 'SETS WON' : sport === 'table-tennis' ? 'GAMES WON' : 'FINAL'
    const finalA =
      sport === 'volleyball'
        ? Number(scoreA?.sets_won ?? 0)
        : sport === 'table-tennis'
          ? Number(scoreA?.games_won ?? 0)
          : Number(scoreA?.q1 ?? 0) +
            Number(scoreA?.q2 ?? 0) +
            Number(scoreA?.q3 ?? 0) +
            Number(scoreA?.q4 ?? 0) +
            Number(scoreA?.ot ?? 0) +
            Number(scoreA?.ot2 ?? 0) +
            Number(scoreA?.ot3 ?? 0)
    const finalB =
      sport === 'volleyball'
        ? Number(scoreB?.sets_won ?? 0)
        : sport === 'table-tennis'
          ? Number(scoreB?.games_won ?? 0)
          : Number(scoreB?.q1 ?? 0) +
            Number(scoreB?.q2 ?? 0) +
            Number(scoreB?.q3 ?? 0) +
            Number(scoreB?.q4 ?? 0) +
            Number(scoreB?.ot ?? 0) +
            Number(scoreB?.ot2 ?? 0) +
            Number(scoreB?.ot3 ?? 0)

    if (periods.length > 0) {
      drawScoreGrid(
        doc,
        periods.map((p) => p.label),
        finalColumnLabel,
        [
          {
            label: data.participantNames.a,
            values: periods.map((p) => p.left),
            final: finalA,
            isWinner: winnerId === data.match.participant_a_id,
          },
          {
            label: data.participantNames.b,
            values: periods.map((p) => p.right),
            final: finalB,
            isWinner: winnerId === data.match.participant_b_id,
          },
        ],
      )
    }

    // Victorious Team banner
    doc.moveDown(0.5)
    const bannerY = doc.y
    doc.lineWidth(2).rect(50, bannerY, 500, 40).stroke()
    doc.lineWidth(1)
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('VICTORIOUS TEAM', 50, bannerY + 8, { width: 500, align: 'center' })
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(winnerName ?? 'Not decided', 50, bannerY + 21, { width: 500, align: 'center' })
    doc.y = bannerY + 50
    doc.moveDown()

    // Player box score, one section per side
    const columns = BOX_SCORE_COLUMNS[sport] ?? BOX_SCORE_COLUMNS.basketball
    for (const side of ['a', 'b'] as const) {
      const teamName = side === 'a' ? data.participantNames.a : data.participantNames.b
      const rows = (data.playerStats as any[]).filter((p) => p.participant_side === side)
      if (rows.length === 0) continue
      doc.fontSize(14).font('Helvetica-Bold').text(`${teamName} — Player Stats`)
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
      doc.moveDown(0.5)
      rows.forEach((p) => {
        const name = p.athlete?.profile?.full_name ?? `Athlete ${String(p.athlete_id).slice(0, 6)}`
        const line = columns.map((c) => `${c.label} ${p.stats?.[c.key] ?? 0}`).join(' · ')
        doc.fontSize(9).font('Helvetica').text(`${name} — ${line}`)
      })
      doc.moveDown()
    }

    doc.end()
  },
)

export default router
