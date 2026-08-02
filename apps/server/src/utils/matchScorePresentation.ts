/**
 * Node port of the presentation helpers in apps/web/src/lib/liveMatchPresentation.ts
 * and apps/web/src/pages/organizer/MatchReview.tsx. Browser TS can't be imported into
 * the server, so these are deliberately duplicated, small, pure functions — kept in
 * one place so the match score sheet PDF (apps/server/src/routes/reports.ts) and any
 * future server-side consumer share one copy instead of re-deriving it.
 */

export type Sport = 'basketball' | 'volleyball' | 'table-tennis'

const nz = (v: unknown) => Number(v) || 0

export type PeriodScoreRow = { label: string; left: number; right: number }

/** Port of periodScoreBreakdown() in apps/web/src/lib/liveMatchPresentation.ts. */
export function buildPeriodTable(
  sport: string,
  sa: Record<string, unknown> | undefined,
  sb: Record<string, unknown> | undefined,
): PeriodScoreRow[] {
  if (!sa && !sb) return []

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
    return rows
  }

  if (sport === 'volleyball') {
    const keys = ['set1', 'set2', 'set3', 'set4', 'set5'] as const
    const rows: PeriodScoreRow[] = []
    keys.forEach((k, i) => {
      const hasStored = sa?.[k] != null || sb?.[k] != null
      const l = nz(sa?.[k])
      const r = nz(sb?.[k])
      if (hasStored || l > 0 || r > 0) rows.push({ label: `Set ${i + 1}`, left: l, right: r })
    })
    return rows
  }

  if (sport === 'table-tennis') {
    const keys = ['game1', 'game2', 'game3', 'game4', 'game5', 'game6', 'game7'] as const
    const rows: PeriodScoreRow[] = []
    keys.forEach((k, i) => {
      const hasStored = sa?.[k] != null || sb?.[k] != null
      const l = nz(sa?.[k])
      const r = nz(sb?.[k])
      if (hasStored || l > 0 || r > 0) rows.push({ label: `Game ${i + 1}`, left: l, right: r })
    })
    return rows
  }

  return []
}

/** Port of the bbTotal/vbSetsWon/ttGamesWon final-score label logic in MatchReview.tsx. */
export function summarizeFinalScore(
  sport: string,
  sa: Record<string, unknown> | undefined,
  sb: Record<string, unknown> | undefined,
): string {
  if (sport === 'volleyball') {
    return `Sets: ${nz(sa?.sets_won)} – ${nz(sb?.sets_won)}`
  }
  if (sport === 'table-tennis') {
    return `Games: ${nz(sa?.games_won)} – ${nz(sb?.games_won)}`
  }
  const bbTotal = (s: Record<string, unknown> | undefined) =>
    nz(s?.q1) + nz(s?.q2) + nz(s?.q3) + nz(s?.q4) + nz(s?.ot) + nz(s?.ot2) + nz(s?.ot3)
  return `${bbTotal(sa)} – ${bbTotal(sb)}`
}

/** Server-side mirror of STAT_KEYS in apps/web/src/lib/matchStatKeys.ts — used only to label PDF columns. */
export const BOX_SCORE_COLUMNS: Record<Sport, { key: string; label: string }[]> = {
  basketball: [
    { key: 'total_points', label: 'PTS' },
    { key: 'fg_made', label: 'FGM' },
    { key: 'fg_attempted', label: 'FGA' },
    { key: 'three_made', label: '3PM' },
    { key: 'three_attempted', label: '3PA' },
    { key: 'ft_made', label: 'FTM' },
    { key: 'ft_attempted', label: 'FTA' },
    { key: 'total_rebounds', label: 'REB' },
    { key: 'off_rebounds', label: 'OREB' },
    { key: 'total_assists', label: 'AST' },
    { key: 'total_steals', label: 'STL' },
    { key: 'total_blocks', label: 'BLK' },
    { key: 'turnovers', label: 'TO' },
    { key: 'fouls', label: 'PF' },
  ],
  volleyball: [
    { key: 'pts_scored', label: 'PTS' },
    { key: 'kills', label: 'Kills' },
    { key: 'attacks', label: 'Att' },
    { key: 'aces', label: 'Aces' },
    { key: 'digs', label: 'Digs' },
    { key: 'blocks', label: 'Blocks' },
    { key: 'assists', label: 'Sets' },
    { key: 'errors', label: 'Err' },
    { key: 'serve_errors', label: 'Srv Err' },
    { key: 'reception_errors', label: 'Rcv Err' },
  ],
  'table-tennis': [
    { key: 'pts_scored', label: 'PTS' },
    { key: 'winners', label: 'Winners' },
    { key: 'aces', label: 'Aces' },
    { key: 'errors', label: 'Err' },
  ],
}
