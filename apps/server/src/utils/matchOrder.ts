/**
 * The one order every client shows an event's matches in, and the rule that
 * keeps a schedule consistent with the bracket.
 *
 * Play order is not up to the schedule: inside a round a match can only start
 * after the earlier-ordered ones have finished, and a round waits for the one
 * before it (see POST /scoring/:id/start). A schedule that contradicts that
 * order would promise a match slot that can never be played, so it is refused.
 */

export type MatchLike = {
  id: string
  status: string
  participant_a_id: string | null
  participant_b_id: string | null
  scheduled_at: string | null
  scores?: Array<Record<string, unknown>> | null
  bracket?: { round: number; match_order: number } | { round: number; match_order: number }[] | null
}

const SCORE_COLUMNS = [
  'q1', 'q2', 'q3', 'q4', 'ot',
  'set1', 'set2', 'set3', 'set4', 'set5',
  'game1', 'game2', 'game3', 'game4', 'game5',
] as const

/** Points on the board for both sides, whichever sport's columns are in use. */
export function matchPointsTotal(scores: MatchLike['scores']): number {
  let total = 0
  for (const row of scores ?? []) {
    for (const col of SCORE_COLUMNS) total += Number(row[col] ?? 0) || 0
  }
  return total
}

export function bracketOf(m: Pick<MatchLike, 'bracket'>): { round: number; match_order: number } | null {
  const b = Array.isArray(m.bracket) ? m.bracket[0] : m.bracket
  return b ? { round: Number(b.round), match_order: Number(b.match_order) } : null
}

/**
 * 0 live with points, 1 live at 0-0, 2 completed, 3 upcoming with both teams known,
 * 4 upcoming still waiting for teams, 5 cancelled.
 */
export function matchGroup(m: MatchLike): number {
  if (m.status === 'live') return matchPointsTotal(m.scores) > 0 ? 0 : 1
  if (m.status === 'completed') return 2
  if (m.status === 'cancelled') return 5
  return m.participant_a_id && m.participant_b_id ? 3 : 4
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY)

/** Matches with scores first, then the rest in bracket order; the schedule only breaks ties. */
export function sortMatchesForDisplay<T extends MatchLike>(matches: T[]): T[] {
  return [...matches].sort((a, b) => {
    const ga = matchGroup(a)
    const gb = matchGroup(b)
    if (ga !== gb) return ga - gb
    if (ga === 0) {
      const diff = matchPointsTotal(b.scores) - matchPointsTotal(a.scores)
      if (diff !== 0) return diff
    }
    if (ga === 2) {
      // Most recently played first; a missing time sorts last.
      const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.NEGATIVE_INFINITY
      const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.NEGATIVE_INFINITY
      if (ta !== tb) return tb - ta
    }
    const ba = bracketOf(a)
    const bb = bracketOf(b)
    if (ba && bb) {
      if (ba.round !== bb.round) return ba.round - bb.round
      if (ba.match_order !== bb.match_order) return ba.match_order - bb.match_order
    } else if (ba || bb) {
      return ba ? -1 : 1
    }
    return time(a.scheduled_at) - time(b.scheduled_at)
  })
}

export type ScheduleConflict = {
  other: MatchLike
  /** The scheduled match this one must come after (earlier) or before (later). */
  relation: 'after' | 'before'
  sameRound: boolean
}

/**
 * Would giving `target` the time `at` put it out of play order? Compares with
 * every other scheduled, non-cancelled match of the event:
 *  - same round, earlier match_order: must be strictly later than it;
 *  - same round, later match_order: must be strictly earlier than it;
 *  - previous round: must be later than every match of it;
 *  - next round: must be earlier than every match of it.
 */
export function findScheduleConflict(
  target: MatchLike,
  others: MatchLike[],
  at: Date,
): ScheduleConflict | null {
  const tb = bracketOf(target)
  if (!tb) return null
  const t = at.getTime()
  for (const o of others) {
    if (o.id === target.id || !o.scheduled_at || o.status === 'cancelled') continue
    const ob = bracketOf(o)
    if (!ob) continue
    const ot = new Date(o.scheduled_at).getTime()
    if (ob.round === tb.round) {
      if (ob.match_order < tb.match_order && t <= ot) return { other: o, relation: 'after', sameRound: true }
      if (ob.match_order > tb.match_order && t >= ot) return { other: o, relation: 'before', sameRound: true }
    } else if (ob.round < tb.round && t <= ot) {
      return { other: o, relation: 'after', sameRound: false }
    } else if (ob.round > tb.round && t >= ot) {
      return { other: o, relation: 'before', sameRound: false }
    }
  }
  return null
}
