import type { MatchScore } from '../types'

const nz = (v: unknown) => Number(v) || 0

function clampPeriod(p: number, sport: string) {
  const max = sport === 'table-tennis' ? 7 : sport === 'basketball' ? 7 : 5
  return Math.min(Math.max(p, 1), max)
}

/** Total basketball points: quarters + OT (up to 3rd OT), or `total` column when period rows were not stored. */
function basketballScoreSheetTotal(sc: Partial<MatchScore> | undefined): number {
  const fromPeriods =
    nz(sc?.q1) + nz(sc?.q2) + nz(sc?.q3) + nz(sc?.q4) + nz(sc?.ot) + nz(sc?.ot2) + nz(sc?.ot3)
  if (fromPeriods > 0) return fromPeriods
  return nz(sc?.total)
}

function bbTotal(sc: Partial<MatchScore> | undefined) {
  return basketballScoreSheetTotal(sc)
}

/** Main score numbers + human-readable phase for hub / modal */
export function liveScorePresentation(
  sport: string,
  sa: Partial<MatchScore> | undefined,
  sb: Partial<MatchScore> | undefined,
  period: number,
) {
  const p = clampPeriod(period, sport)
  if (sport === 'basketball') {
    return {
      left: bbTotal(sa),
      right: bbTotal(sb),
      phase: p <= 4 ? `Quarter ${p}` : `Overtime${p > 5 ? ` ${p - 4}` : ''}`,
      subtitle: `${getSportPhrase(sport)} · Game total`,
    }
  }
  if (sport === 'volleyball') {
    const keys = ['set1', 'set2', 'set3', 'set4', 'set5'] as const
    const k = keys[p - 1]
    return {
      left: Number(sa?.[k] ?? 0),
      right: Number(sb?.[k] ?? 0),
      phase: `Set ${p} (rally points)`,
      subtitle: `${Number(sa?.sets_won ?? 0)}–${Number(sb?.sets_won ?? 0)} sets won · ${getSportPhrase(sport)}`,
    }
  }
  if (sport === 'table-tennis') {
    const keys = ['game1', 'game2', 'game3', 'game4', 'game5', 'game6', 'game7'] as const
    const k = keys[p - 1]
    return {
      left: Number(sa?.[k] ?? 0),
      right: Number(sb?.[k] ?? 0),
      phase: `Game ${p} (points)`,
      subtitle: `${Number(sa?.games_won ?? 0)}–${Number(sb?.games_won ?? 0)} games won · ${getSportPhrase(sport)}`,
    }
  }
  return { left: 0, right: 0, phase: '', subtitle: sport }
}

function getSportPhrase(sport: string) {
  if (sport === 'basketball') return 'Basketball'
  if (sport === 'volleyball') return 'Volleyball'
  if (sport === 'table-tennis') return 'Table tennis'
  return sport
}

export function pickScoresForMatch(
  participantA: string | null | undefined,
  participantB: string | null | undefined,
  scores: Partial<MatchScore>[] | undefined,
) {
  const rows = scores ?? []
  const sa = rows.find((r) => r.participant_id === participantA)
  const sb = rows.find((r) => r.participant_id === participantB)
  return { sa, sb }
}

export type PeriodScoreRow = { label: string; left: number; right: number }

export type PeriodScoreBreakdown = {
  rows: PeriodScoreRow[]
  totals: { left: number; right: number }
  /** e.g. sets won / games won summary */
  summaryLine?: string
}

/** Total points on the score sheet (quarters + OT, or DB `total` fallback). */
export function basketballParticipantTotal(sc: Partial<MatchScore> | undefined): number {
  return basketballScoreSheetTotal(sc)
}

/**
 * Period-by-period breakdown for match detail modals (basketball quarters + OT, volleyball sets, table-tennis games).
 */
export function periodScoreBreakdown(
  sport: string,
  sa: Partial<MatchScore> | undefined,
  sb: Partial<MatchScore> | undefined,
): PeriodScoreBreakdown | null {
  if (!sa && !sb) return null

  if (sport === 'basketball') {
    const rows: PeriodScoreRow[] = [
      { label: 'Q1', left: nz(sa?.q1), right: nz(sb?.q1) },
      { label: 'Q2', left: nz(sa?.q2), right: nz(sb?.q2) },
      { label: 'Q3', left: nz(sa?.q3), right: nz(sb?.q3) },
      { label: 'Q4', left: nz(sa?.q4), right: nz(sb?.q4) },
    ]
    const otKeys = ['ot', 'ot2', 'ot3'] as const
    otKeys.forEach((k, i) => {
      const l = nz(sa?.[k])
      const r = nz(sb?.[k])
      if (sa?.[k] != null || sb?.[k] != null || l > 0 || r > 0) {
        rows.push({ label: i === 0 ? 'OT' : `OT${i + 1}`, left: l, right: r })
      }
    })

    const quarterSum =
      nz(sa?.q1) +
      nz(sa?.q2) +
      nz(sa?.q3) +
      nz(sa?.q4) +
      nz(sa?.ot) +
      nz(sa?.ot2) +
      nz(sa?.ot3) +
      nz(sb?.q1) +
      nz(sb?.q2) +
      nz(sb?.q3) +
      nz(sb?.q4) +
      nz(sb?.ot) +
      nz(sb?.ot2) +
      nz(sb?.ot3)

    // Only quarter keys populated → still show grid; if everything zero but `total` exists, fold into one row
    if (quarterSum === 0 && (nz(sa?.total) > 0 || nz(sb?.total) > 0)) {
      return {
        rows: [{ label: 'Final', left: nz(sa?.total), right: nz(sb?.total) }],
        totals: { left: nz(sa?.total), right: nz(sb?.total) },
      }
    }

    return {
      rows,
      totals: {
        left: basketballParticipantTotal(sa),
        right: basketballParticipantTotal(sb),
      },
    }
  }

  if (sport === 'volleyball') {
    const keys = ['set1', 'set2', 'set3', 'set4', 'set5'] as const
    const rows: PeriodScoreRow[] = []
    keys.forEach((k, i) => {
      const hasStored = sa?.[k] != null || sb?.[k] != null
      const l = nz(sa?.[k])
      const r = nz(sb?.[k])
      if (hasStored || l > 0 || r > 0) {
        rows.push({ label: `Set ${i + 1}`, left: l, right: r })
      }
    })
    const swA = nz(sa?.sets_won)
    const swB = nz(sb?.sets_won)
    const summaryLine = swA > 0 || swB > 0 ? `Sets won · ${swA} – ${swB}` : undefined
    const totals = {
      left: rows.reduce((acc, x) => acc + x.left, 0),
      right: rows.reduce((acc, x) => acc + x.right, 0),
    }
    if (rows.length === 0 && summaryLine) {
      return { rows: [], totals: { left: swA, right: swB }, summaryLine }
    }
    return { rows, totals, summaryLine }
  }

  if (sport === 'table-tennis') {
    const keys = ['game1', 'game2', 'game3', 'game4', 'game5', 'game6', 'game7'] as const
    const rows: PeriodScoreRow[] = []
    keys.forEach((k, i) => {
      const hasStored = sa?.[k] != null || sb?.[k] != null
      const l = nz(sa?.[k])
      const r = nz(sb?.[k])
      if (hasStored || l > 0 || r > 0) {
        rows.push({ label: `Game ${i + 1}`, left: l, right: r })
      }
    })
    const gwA = nz(sa?.games_won)
    const gwB = nz(sb?.games_won)
    const summaryLine = gwA > 0 || gwB > 0 ? `Games won · ${gwA} – ${gwB}` : undefined
    const totals = {
      left: rows.reduce((acc, x) => acc + x.left, 0),
      right: rows.reduce((acc, x) => acc + x.right, 0),
    }
    if (rows.length === 0 && summaryLine) {
      return { rows: [], totals: { left: gwA, right: gwB }, summaryLine }
    }
    return { rows, totals, summaryLine }
  }

  return null
}
