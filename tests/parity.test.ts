// The web app and the API each carry their own copy of a few rules (the API is
// the enforcement point, the web copy gives instant feedback). They are
// documented as "kept in sync manually", so this test fails the moment one
// drifts from the other.
import { describe, expect, it } from 'vitest'
import * as webPlacements from '../apps/web/src/lib/eventPlacements'
import * as serverPlacements from '../apps/server/src/utils/eventPlacements'
import * as webYear from '../apps/web/src/lib/validation/yearLevel'
import * as serverYear from '../apps/server/src/utils/yearLevel'

const bracket = (
  round: number,
  order: number,
  a: string,
  b: string,
  winner: string | null,
  type?: string,
) => ({
  round,
  match_order: order,
  participant_a_id: a,
  participant_b_id: b,
  winner_id: winner,
  is_bye: false,
  bracket_type: type,
})

describe('web and server stay in sync', () => {
  const knockout = [bracket(1, 1, 'A', 'B', 'A'), bracket(1, 2, 'C', 'D', 'D'), bracket(2, 1, 'A', 'D', 'D')]
  const roundRobin = [
    bracket(1, 1, 'A', 'B', 'A', 'round_robin'),
    bracket(1, 2, 'A', 'C', 'C', 'round_robin'),
    bracket(1, 3, 'B', 'C', 'C', 'round_robin'),
  ]
  const unfinished = [bracket(1, 1, 'A', 'B', null)]

  it.each([
    ['knockout', knockout],
    ['round robin', roundRobin],
    ['unfinished', unfinished],
  ])('derives identical event standings for a %s', (_name, data) => {
    expect(serverPlacements.deriveFullEventStandings(data as never)).toEqual(
      webPlacements.deriveFullEventStandings(data as never),
    )
  })

  it.each(['SHS', 'SBMA', 'SECA', 'SASE'])('normalizes year levels the same way for %s', (dept) => {
    for (const raw of ['1', '2nd', '4th Year', 'Grade 11', 'G12', '12', '5', '0', 'x', '']) {
      expect(serverYear.normalizeYearLevel(raw, dept)).toBe(webYear.normalizeYearLevel(raw, dept))
    }
    expect(serverYear.yearLevelsForDepartment(dept)).toEqual(webYear.yearLevelsForDepartment(dept))
  })
})
