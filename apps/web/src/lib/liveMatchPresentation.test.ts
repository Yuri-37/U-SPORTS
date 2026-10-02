import { describe, expect, it } from 'vitest'
import { liveScorePresentation, pickScoresForMatch } from './liveMatchPresentation'

describe('live score presentation', () => {
  it('totals basketball quarters and names the quarter', () => {
    const pres = liveScorePresentation('basketball', { q1: 10, q2: 12 }, { q1: 8, q2: 9 }, 2)
    expect(pres.left).toBe(22)
    expect(pres.right).toBe(17)
    expect(pres.phase).toBe('Quarter 2')
    expect(pres.subtitle).toBe('Basketball · Game total')
  })

  it('calls the fifth period overtime', () => {
    expect(liveScorePresentation('basketball', {}, {}, 5).phase).toBe('Overtime')
  })

  it('shows the current volleyball set and the sets won', () => {
    const pres = liveScorePresentation(
      'volleyball',
      { set1: 25, set2: 10, sets_won: 1 },
      { set1: 20, set2: 12, sets_won: 0 },
      2,
    )
    expect([pres.left, pres.right]).toEqual([10, 12])
    expect(pres.phase).toBe('Set 2 (rally points)')
    expect(pres.subtitle).toContain('1–0 sets won')
  })

  it('shows the current table tennis game and the games won', () => {
    const pres = liveScorePresentation('table-tennis', { game1: 11, games_won: 1 }, { game1: 7, games_won: 0 }, 1)
    expect([pres.left, pres.right]).toEqual([11, 7])
    expect(pres.subtitle).toContain('1–0 games won')
  })

  it('stays at zero before anything is recorded', () => {
    const pres = liveScorePresentation('basketball', undefined, undefined, 1)
    expect([pres.left, pres.right]).toEqual([0, 0])
  })

  it('matches score rows to the right side of the match', () => {
    const scores = [
      { participant_id: 'B', q1: 9 },
      { participant_id: 'A', q1: 4 },
    ]
    const { sa, sb } = pickScoresForMatch('A', 'B', scores as never)
    expect(sa?.q1).toBe(4)
    expect(sb?.q1).toBe(9)
  })
})
