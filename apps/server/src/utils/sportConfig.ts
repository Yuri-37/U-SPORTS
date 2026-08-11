export type Sport = 'basketball' | 'volleyball' | 'table-tennis'
export type TTFormat = 'singles' | 'doubles'

interface SportConfig {
  maxRoster: number
  /** Default active slots when table_tennis_format is irrelevant */
  activeSlots: number
}

const SPORT_CONFIG: Record<Sport, SportConfig> = {
  basketball: { maxRoster: 15, activeSlots: 5 },
  volleyball: { maxRoster: 12, activeSlots: 6 },
  'table-tennis': { maxRoster: 8, activeSlots: 1 },
}

export function getMaxRoster(sport: string): number {
  return SPORT_CONFIG[sport as Sport]?.maxRoster ?? 15
}

/** Active slots for a specific MATCH — table tennis format is set per-event
 *  (events.table_tennis_format), so a singles event needs 1 and a doubles
 *  event needs 2. Used when actually seeding a match's active_lineup. */
export function getActiveSlots(sport: string, ttFormat?: string | null): number {
  if (sport === 'table-tennis') {
    return ttFormat === 'doubles' ? 2 : 1
  }
  return SPORT_CONFIG[sport as Sport]?.activeSlots ?? 5
}

/** Active slots for a TEAM's lineup — the roster-management cap, independent of
 *  any one event. Table tennis teams must be allowed to stage the larger of
 *  singles/doubles (2), since a team can enter both formats across different
 *  events; getActiveSlots() narrows to the real per-match number at match time. */
export function getMaxActiveSlots(sport: string): number {
  if (sport === 'table-tennis') return 2
  return SPORT_CONFIG[sport as Sport]?.activeSlots ?? 5
}
