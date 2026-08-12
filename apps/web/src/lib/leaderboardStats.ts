/**
 * Sport-specific stat columns for player leaderboard tables.
 *
 * Mirrors mobile/lib/utils/leaderboard_stats.dart — the two must stay in sync
 * so the same athlete reads identically on both platforms.
 *
 * Every key here is one recompute_player_season_stats actually aggregates from
 * player_game_stats. Table tennis used to show a single "Win%" column reading
 * `win_pct`, and profiles showed "Match wins" reading `mw`; neither is ever
 * written by scoring (only the retired showcase seed script produced them), so
 * both rendered 0 for every table tennis player, forever.
 */

export type LeaderboardStatCell = {
  label: string
  value: string
  /** Primary stat for the sport — rendered bold, first after GP. */
  emphasis?: boolean
}

type Stats = Record<string, number> | null | undefined

/** Reads a numeric stat key, tolerating string-encoded numbers from JSONB. */
export function statNum(stats: Stats, key: string): number {
  const v = stats?.[key]
  if (typeof v === 'number') return v
  const parsed = Number(v)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Whole-percent string, e.g. "47%". Returns an em dash when the denominator is
 * 0 so an unplayed stat line doesn't read as a real 0% performance.
 */
export function pct(made: number, attempted: number): string {
  if (attempted <= 0) return '—'
  return `${Math.round((made / attempted) * 100)}%`
}

/**
 * Winners-to-errors ratio. With no errors the ratio is undefined rather than
 * zero, so fall back to the winner count itself (which is how it reads in
 * practice: "9 winners, no errors").
 */
export function ratio(numerator: number, denominator: number): string {
  if (denominator <= 0) return numerator > 0 ? numerator.toFixed(1) : '—'
  return (numerator / denominator).toFixed(1)
}

export function playerStatCells(
  sport: string,
  stats: Stats,
  gamesPlayed: number,
): LeaderboardStatCell[] {
  const gp = gamesPlayed
  const n = (k: string) => statNum(stats, k)
  const avg = (total: number) => (gp > 0 ? (total / gp).toFixed(1) : '0.0')

  if (sport === 'basketball') {
    return [
      { label: 'GP', value: String(gp) },
      { label: 'PPG', value: avg(n('total_points')), emphasis: true },
      { label: 'RPG', value: avg(n('total_rebounds')) },
      { label: 'APG', value: avg(n('total_assists')) },
      { label: 'SPG', value: avg(n('total_steals')) },
      { label: 'BPG', value: avg(n('total_blocks')) },
      { label: 'FG%', value: pct(n('fg_made'), n('fg_attempted')) },
    ]
  }
  if (sport === 'volleyball') {
    return [
      { label: 'GP', value: String(gp) },
      { label: 'PTS', value: String(Math.round(n('pts_scored'))), emphasis: true },
      { label: 'Kills', value: String(Math.round(n('kills'))) },
      { label: 'Aces', value: String(Math.round(n('aces'))) },
      { label: 'Digs', value: String(Math.round(n('digs'))) },
      { label: 'Blocks', value: String(Math.round(n('blocks'))) },
      { label: 'Kill%', value: pct(n('kills'), n('attacks')) },
    ]
  }
  if (sport === 'table-tennis') {
    return [
      { label: 'GP', value: String(gp) },
      { label: 'PTS', value: String(Math.round(n('pts_scored'))), emphasis: true },
      { label: 'Winners', value: String(Math.round(n('winners'))) },
      { label: 'Aces', value: String(Math.round(n('aces'))) },
      { label: 'Errors', value: String(Math.round(n('errors'))) },
      { label: 'W/E', value: ratio(n('winners'), n('errors')) },
    ]
  }
  return [{ label: 'GP', value: String(gp) }]
}

/**
 * Compact per-athlete season summary (profile stat cards), as opposed to the
 * full leaderboard row above.
 */
export function seasonStatHighlights(
  sport: string,
  stats: Stats,
  gamesPlayed: number,
): LeaderboardStatCell[] {
  const n = (k: string) => statNum(stats, k)
  const gp = gamesPlayed <= 0 ? 1 : gamesPlayed

  if (sport === 'basketball') {
    return [
      { label: 'PPG', value: (n('total_points') / gp).toFixed(1) },
      { label: 'RPG', value: (n('total_rebounds') / gp).toFixed(1) },
      { label: 'APG', value: (n('total_assists') / gp).toFixed(1) },
      { label: 'FG%', value: pct(n('fg_made'), n('fg_attempted')) },
    ]
  }
  if (sport === 'volleyball') {
    return [
      { label: 'Kills', value: String(Math.round(n('kills'))) },
      { label: 'Aces', value: String(Math.round(n('aces'))) },
      { label: 'Digs', value: String(Math.round(n('digs'))) },
      { label: 'Blocks', value: String(Math.round(n('blocks'))) },
    ]
  }
  if (sport === 'table-tennis') {
    return [
      { label: 'PTS', value: String(Math.round(n('pts_scored'))) },
      { label: 'Winners', value: String(Math.round(n('winners'))) },
      { label: 'Aces', value: String(Math.round(n('aces'))) },
      { label: 'W/E', value: ratio(n('winners'), n('errors')) },
    ]
  }
  return [{ label: 'Games', value: String(gamesPlayed) }]
}
