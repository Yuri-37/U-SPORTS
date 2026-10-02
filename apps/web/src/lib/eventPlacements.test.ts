import { describe, expect, it } from 'vitest'
import {
  deriveEliminationPodium,
  deriveFullEventStandings,
  placementRankLabel,
  type BracketPlacementInput,
} from './eventPlacements'

const m = (
  round: number,
  match_order: number,
  a: string,
  b: string,
  winner: string | null,
  extra: Partial<BracketPlacementInput> = {},
): BracketPlacementInput => ({
  round,
  match_order,
  participant_a_id: a,
  participant_b_id: b,
  winner_id: winner,
  is_bye: false,
  ...extra,
})

const fourTeamKnockout = [m(1, 1, 'A', 'B', 'A'), m(1, 2, 'C', 'D', 'D'), m(2, 1, 'A', 'D', 'D')]

describe('event placements', () => {
  it('names the champion and runner-up from the final', () => {
    expect(deriveEliminationPodium(fourTeamKnockout)).toEqual([
      { rank: 1, participantId: 'D', role: 'champion' },
      { rank: 2, participantId: 'A', role: 'runner_up' },
    ])
  })

  it('has no podium until the final has a winner', () => {
    expect(deriveEliminationPodium([m(1, 1, 'A', 'B', 'A'), m(2, 1, 'A', 'C', null)])).toBeNull()
  })

  it('ranks every team in a knockout, sharing third place', () => {
    const standings = deriveFullEventStandings(fourTeamKnockout)!
    expect(standings.map((s) => [s.participantId, s.rank])).toEqual([
      ['D', 1],
      ['A', 2],
      ['B', 3],
      ['C', 3],
    ])
  })

  it('ranks a round robin by wins', () => {
    const rr = (o: number, a: string, b: string, w: string) =>
      m(1, o, a, b, w, { bracket_type: 'round_robin' })
    const standings = deriveFullEventStandings([rr(1, 'A', 'B', 'A'), rr(2, 'A', 'C', 'A'), rr(3, 'B', 'C', 'B')])!
    expect(standings.map((s) => s.participantId)).toEqual(['A', 'B', 'C'])
    expect(standings[0].role).toBe('champion')
  })

  it('labels ranks the way the screens show them', () => {
    expect([1, 2, 3, 11].map(placementRankLabel)).toEqual(['Champion', 'Runner-up', '#3', '#11'])
  })
})
