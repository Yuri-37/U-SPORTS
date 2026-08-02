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

export function getActiveSlots(sport: string, ttFormat?: string | null): number {
  if (sport === 'table-tennis') {
    return ttFormat === 'doubles' ? 2 : 1
  }
  return SPORT_CONFIG[sport as Sport]?.activeSlots ?? 5
}
