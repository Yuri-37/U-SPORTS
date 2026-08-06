/** Bracket rows used to derive event standings (public read). */
export type BracketPlacementInput = {
  round: number
  match_order: number
  participant_a_id: string | null
  participant_b_id: string | null
  winner_id: string | null
  is_bye: boolean
  bracket_type?: string | null
}

export type EventPlacement = {
  rank: number
  participantId: string
  role: 'champion' | 'runner_up' | 'ranked'
}

const POOL_TYPES = new Set(['rr_pool_a', 'rr_pool_b', 'round_robin'])

/**
 * Champion + runner-up from the highest knockout round (single/double elim, crossover finals).
 * Returns null for bracket pools-only or undecided finals.
 *
 * Kept standalone (not just "the first two entries of deriveFullEventStandings")
 * because callers that only need the headline result — e.g. push-notification
 * text — shouldn't have to pull in the full-field derivation below.
 */
export function deriveEliminationPodium(
  brackets: BracketPlacementInput[],
): EventPlacement[] | null {
  const structural = brackets.filter((b) => {
    const t = b.bracket_type ?? 'winners'
    if (t === 'losers') return false
    if (POOL_TYPES.has(t)) return false
    return true
  })
  if (structural.length === 0) return null

  const maxRound = Math.max(...structural.map((b) => b.round))
  const finals = structural.filter(
    (b) =>
      b.round === maxRound && !b.is_bye && b.winner_id && b.participant_a_id && b.participant_b_id,
  )
  if (finals.length === 0) return null

  const grand = finals.find((b) => b.bracket_type === 'grand_final')
  const finalBracket = grand ?? [...finals].sort((a, b) => a.match_order - b.match_order)[0]

  const w = finalBracket.winner_id as string
  const a = finalBracket.participant_a_id as string
  const b = finalBracket.participant_b_id as string
  const runner = w === a ? b : a

  return [
    { rank: 1, participantId: w, role: 'champion' },
    { rank: 2, participantId: runner, role: 'runner_up' },
  ]
}

export function placementRankLabel(rank: number): string {
  if (rank === 1) return 'Champion'
  if (rank === 2) return 'Runner-up'
  return `#${rank}`
}

/**
 * Full event standings — every participant that appears anywhere in the
 * bracket, not just champion/runner-up. Two derivations depending on format:
 *
 * - Elimination (single/double elim): champion/runner-up from the final
 *   (unchanged, see deriveEliminationPodium above), everyone else ranked by
 *   the furthest round they reached before losing. Teams eliminated in the
 *   same round tie and share a rank (standard "1,2,3,3,5" competition
 *   ranking — the next distinct rank skips by the tie group's size).
 *   Double-elim's losers-bracket rows are deprioritized below every winners
 *   round regardless of raw round number (the generator stores losers
 *   rounds as `round + 100`, which would otherwise sort them *above*
 *   winners rounds) — see effectiveRound below. In practice this app's
 *   double-elim never actually advances a loser into those slots (only
 *   advanceWinner exists, no advanceLoser), so this mostly matters for
 *   forward-compatibility rather than real data today.
 *
 * - Round robin (plain or split-pool-with-crossover): ranked by event-scoped
 *   win/loss record tallied directly from bracket rows (pool matches store
 *   `winner_id` on the bracket itself — no separate query needed). A split
 *   pool format additionally has a real `knockout_final` match, which is
 *   the only case where two pools' win/loss records are actually
 *   comparable — that decides champion/runner-up; a plain single-table
 *   round robin has no such match, so its rank-1/2 are just the top of the
 *   W/L standings (and only get the champion/runner_up role if no tie).
 *
 * Returns null under the same conditions the two source derivations do
 * (empty bracket, or — for pure elimination with no pool rows — an
 * undecided final).
 */
export function deriveFullEventStandings(
  brackets: BracketPlacementInput[],
): EventPlacement[] | null {
  if (brackets.length === 0) return null
  const hasPool = brackets.some((b) => POOL_TYPES.has(b.bracket_type ?? ''))
  return hasPool ? deriveRoundRobinStandings(brackets) : deriveEliminationStandings(brackets)
}

function deriveEliminationStandings(brackets: BracketPlacementInput[]): EventPlacement[] | null {
  const podium = deriveEliminationPodium(brackets)
  if (!podium) return null
  const [champion, runnerUp] = podium

  const remaining = new Set<string>()
  for (const b of brackets) {
    if (b.participant_a_id) remaining.add(b.participant_a_id)
    if (b.participant_b_id) remaining.add(b.participant_b_id)
  }
  remaining.delete(champion.participantId)
  remaining.delete(runnerUp.participantId)

  // Furthest round each remaining participant reached. Losers-bracket rounds
  // are pushed far below any winners round so double-elim can't accidentally
  // rank a losers-bracket team above one still alive in winners.
  const effectiveRound = new Map<string, number>()
  for (const b of brackets) {
    const r = b.bracket_type === 'losers' ? b.round - 1_000_000 : b.round
    for (const pid of [b.participant_a_id, b.participant_b_id]) {
      if (!pid || !remaining.has(pid)) continue
      const cur = effectiveRound.get(pid)
      if (cur === undefined || r > cur) effectiveRound.set(pid, r)
    }
  }

  const grouped = new Map<number, string[]>()
  for (const [pid, r] of effectiveRound) {
    const list = grouped.get(r)
    if (list) list.push(pid)
    else grouped.set(r, [pid])
  }
  const roundsDesc = [...grouped.keys()].sort((a, b) => b - a)

  const placements: EventPlacement[] = [
    { rank: 1, participantId: champion.participantId, role: 'champion' },
    { rank: 2, participantId: runnerUp.participantId, role: 'runner_up' },
  ]
  let rank = 3
  for (const r of roundsDesc) {
    const ids = [...grouped.get(r)!].sort()
    for (const pid of ids) placements.push({ rank, participantId: pid, role: 'ranked' })
    rank += ids.length
  }
  return placements
}

function deriveRoundRobinStandings(brackets: BracketPlacementInput[]): EventPlacement[] | null {
  const poolBrackets = brackets.filter((b) => POOL_TYPES.has(b.bracket_type ?? ''))
  if (poolBrackets.length === 0) return null

  const wins = new Map<string, number>()
  const losses = new Map<string, number>()
  const touch = (id: string) => {
    if (!wins.has(id)) {
      wins.set(id, 0)
      losses.set(id, 0)
    }
  }
  for (const b of poolBrackets) {
    if (b.participant_a_id) touch(b.participant_a_id)
    if (b.participant_b_id) touch(b.participant_b_id)
    if (!b.winner_id || !b.participant_a_id || !b.participant_b_id) continue
    const loserId = b.winner_id === b.participant_a_id ? b.participant_b_id : b.participant_a_id
    wins.set(b.winner_id, (wins.get(b.winner_id) ?? 0) + 1)
    losses.set(loserId, (losses.get(loserId) ?? 0) + 1)
  }

  // Split-pool format only: two pools' W/L records aren't comparable to each
  // other, so champion/runner-up come from the actual crossover final, not
  // the pool standings — mirrors deriveEliminationPodium's final-match logic.
  const finalBracket = brackets.find(
    (b) =>
      b.bracket_type === 'knockout_final' &&
      b.winner_id &&
      b.participant_a_id &&
      b.participant_b_id,
  )
  const championId = finalBracket ? (finalBracket.winner_id as string) : null
  const runnerUpId = finalBracket
    ? finalBracket.participant_a_id === championId
      ? (finalBracket.participant_b_id as string)
      : (finalBracket.participant_a_id as string)
    : null

  const rest = [...wins.keys()].filter((id) => id !== championId && id !== runnerUpId)
  rest.sort((a, b) => {
    const wa = wins.get(a) ?? 0
    const wb = wins.get(b) ?? 0
    if (wb !== wa) return wb - wa
    const la = losses.get(a) ?? 0
    const lb = losses.get(b) ?? 0
    if (la !== lb) return la - lb
    return a.localeCompare(b)
  })

  const placements: EventPlacement[] = []
  let rank = 1
  if (championId) {
    placements.push({ rank: 1, participantId: championId, role: 'champion' })
    rank = 2
  }
  if (runnerUpId) {
    placements.push({ rank, participantId: runnerUpId, role: 'runner_up' })
    rank++
  }

  // Group the rest by tied (wins, losses) for standard competition ranking —
  // ties share a rank, the next distinct rank skips by the tie group's size.
  let i = 0
  while (i < rest.length) {
    const wa = wins.get(rest[i]) ?? 0
    const la = losses.get(rest[i]) ?? 0
    let j = i
    while (j < rest.length && (wins.get(rest[j]) ?? 0) === wa && (losses.get(rest[j]) ?? 0) === la) {
      j++
    }
    const groupSize = j - i
    // No crossover final decided this event's top spots yet — the top W/L
    // group can only claim champion/runner-up if it isn't itself a tie.
    for (let k = i; k < j; k++) {
      let role: EventPlacement['role'] = 'ranked'
      if (!championId && rank === 1 && groupSize === 1) role = 'champion'
      else if (!runnerUpId && rank === 2 && groupSize === 1) role = 'runner_up'
      placements.push({ rank, participantId: rest[k], role })
    }
    rank += groupSize
    i = j
  }
  return placements
}
