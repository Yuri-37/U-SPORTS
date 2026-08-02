/** Bracket rows used to derive knockout champion / runner-up (public read). */
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
  rank: 1 | 2
  participantId: string
  role: 'champion' | 'runner_up'
}

const POOL_TYPES = new Set(['rr_pool_a', 'rr_pool_b', 'round_robin'])

/**
 * Champion + runner-up from the highest knockout round (single/double elim, crossover finals).
 * Returns null for bracket pools-only or undecided finals.
 */
export function deriveEliminationPodium(brackets: BracketPlacementInput[]): EventPlacement[] | null {
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
      b.round === maxRound &&
      !b.is_bye &&
      b.winner_id &&
      b.participant_a_id &&
      b.participant_b_id
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

export function placementRankLabel(rank: 1 | 2): string {
  return rank === 1 ? 'Champion' : 'Runner-up'
}
