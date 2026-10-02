import { describe, expect, it } from 'vitest'
import { rankingValue, sortByRank, sortTeamStandings } from './leaderboardStats'

const team = (name: string, wins: number, losses: number) => ({ wins, losses, team: { name } })

describe('team rankings', () => {
  it('ranks by win percentage, not raw wins', () => {
    // 2-0 (100%) must beat 3-3 (50%) even though 3 > 2.
    const sorted = sortTeamStandings([team('Steady', 3, 3), team('Perfect', 2, 0)])
    expect(sorted.map((t) => t.team.name)).toEqual(['Perfect', 'Steady'])
  })

  it('breaks ties on wins, then fewer losses, then name', () => {
    const sorted = sortTeamStandings([
      team('Zulu', 2, 2),
      team('Alpha', 2, 2),
      team('Fewer losses', 1, 1),
      team('More games', 2, 2),
    ])
    expect(sorted.map((t) => t.team.name)).toEqual(['Alpha', 'More games', 'Zulu', 'Fewer losses'])
  })

  it('handles teams that have not played', () => {
    expect(sortTeamStandings([team('B', 0, 0), team('A', 1, 0)]).map((t) => t.team.name)).toEqual(['A', 'B'])
  })

  it('does not mutate its input', () => {
    const input = [team('B', 0, 1), team('A', 1, 0)]
    sortTeamStandings(input)
    expect(input[0].team.name).toBe('B')
  })
})

describe('player rankings', () => {
  const row = (name: string, gp: number, stats: Record<string, number>) => ({
    games_played: gp,
    stats,
    athlete: { profile: { full_name: name } },
  })

  it('ranks basketball by points per game', () => {
    expect(rankingValue('basketball', { total_points: 50 }, 5)).toBe(10)
    expect(rankingValue('basketball', { total_points: 50 }, 0)).toBe(0)
  })

  it('ranks volleyball and table tennis by points scored', () => {
    expect(rankingValue('volleyball', { pts_scored: 33 }, 3)).toBe(33)
    expect(rankingValue('table-tennis', { pts_scored: 21 }, 2)).toBe(21)
  })

  it('puts the better scorer first and breaks ties by games played then name', () => {
    const sorted = sortByRank(
      [
        row('Cruz', 4, { total_points: 40 }),
        row('Abad', 2, { total_points: 20 }),
        row('Bayani', 5, { total_points: 20 }),
        row('Top', 3, { total_points: 60 }),
      ],
      'basketball',
    )
    expect(sorted.map((r) => r.athlete.profile.full_name)).toEqual(['Top', 'Cruz', 'Abad', 'Bayani'])
  })
})
