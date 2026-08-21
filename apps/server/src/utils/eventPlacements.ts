/** Event standings derivation (matches web `eventPlacements.ts` exactly — kept in sync manually). */

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

/** Full event standings — every participant that appears anywhere in the bracket. See web eventPlacements.ts for the full design rationale. */
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

  // Furthest round each remaining participant reached. A losers-bracket
  // appearance is always chronologically later than the winners-bracket loss
  // that sent them there, so it should determine their placement once it
  // exists -- the generator's losers-round numbers (1000+) are deliberately
  // well above any realistic winners-bracket round count, so plain `max()`
  // over `b.round` already prefers it with no special-casing needed.
  const effectiveRound = new Map<string, number>()
  for (const b of brackets) {
    for (const pid of [b.participant_a_id, b.participant_b_id]) {
      if (!pid || !remaining.has(pid)) continue
      const cur = effectiveRound.get(pid)
      if (cur === undefined || b.round > cur) effectiveRound.set(pid, b.round)
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

  let i = 0
  while (i < rest.length) {
    const wa = wins.get(rest[i]) ?? 0
    const la = losses.get(rest[i]) ?? 0
    let j = i
    while (j < rest.length && (wins.get(rest[j]) ?? 0) === wa && (losses.get(rest[j]) ?? 0) === la) {
      j++
    }
    const groupSize = j - i
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
