import { v4 as uuid } from 'uuid'
import supabase from '../utils/supabase'

type BracketFormat = 'single_elim' | 'double_elim' | 'round_robin'

interface Participant {
  id: string
  seed?: number
}

interface BracketNode {
  id: string
  event_id: string
  round: number
  match_order: number
  participant_a_id: string | null
  participant_b_id: string | null
  winner_id: string | null
  next_bracket_id: string | null
  is_bye: boolean
  bracket_type: string
  /** Double elimination only: where this match's LOSER drops to, and which slot they fill there. */
  loser_next_bracket_id: string | null
  loser_slot: 'a' | 'b' | null
}

interface MatchStub {
  id: string
  event_id: string
  bracket_id: string | null
  participant_a_id: string | null
  participant_b_id: string | null
  status: string
}

function nextPowerOfTwo(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

function seedParticipants(participants: Participant[]): Participant[] {
  // Sort by seed if provided, otherwise keep order
  return [...participants].sort((a, b) => {
    if (a.seed !== undefined && b.seed !== undefined) return a.seed - b.seed
    if (a.seed !== undefined) return -1
    if (b.seed !== undefined) return 1
    return 0
  })
}

// Single Elimination bracket
function buildSingleElim(
  eventId: string,
  participants: Participant[],
): { brackets: BracketNode[]; matches: MatchStub[] } {
  const seeded = seedParticipants(participants)
  const size = nextPowerOfTwo(seeded.length)
  const totalRounds = Math.log2(size)
  const brackets: BracketNode[] = []
  const matches: MatchStub[] = []

  // Build from final round backwards
  // Round 1 = first round, round totalRounds = final
  const roundBrackets: BracketNode[][] = []

  // Create all bracket slots
  for (let round = 1; round <= totalRounds; round++) {
    const matchesInRound = size / Math.pow(2, round)
    const roundSlots: BracketNode[] = []
    for (let order = 0; order < matchesInRound; order++) {
      const node: BracketNode = {
        id: uuid(),
        event_id: eventId,
        round,
        match_order: order,
        participant_a_id: null,
        participant_b_id: null,
        winner_id: null,
        next_bracket_id: null,
        is_bye: false,
        bracket_type: 'winners',
        loser_next_bracket_id: null,
        loser_slot: null,
      }
      roundSlots.push(node)
    }
    roundBrackets.push(roundSlots)
  }

  // Link next_bracket_id: each match feeds into parent round
  for (let r = 0; r < roundBrackets.length - 1; r++) {
    for (let i = 0; i < roundBrackets[r].length; i++) {
      const parentIndex = Math.floor(i / 2)
      roundBrackets[r][i].next_bracket_id = roundBrackets[r + 1][parentIndex].id
    }
  }

  // Seed first round (round index 0).
  // Pad to power-of-two size, then assign byes so every R1 slot has at least one team.
  // Old logic paired seeded[0..n-1] into consecutive slots; when n < size that left
  // trailing slots as null vs null ("ghost" games). Correct model: (size - n) top seeds
  // get first-round byes; remaining teams play (n - byeCount) / 2 contested matches.
  const firstRound = roundBrackets[0]
  const n = seeded.length
  const byeCount = size - n
  const byeRecipients = seeded.slice(0, byeCount)
  const playingTeams = seeded.slice(byeCount)
  const contestedMatchCount = playingTeams.length / 2
  const nextRound = roundBrackets[1]

  let slot = 0
  for (let j = 0; j < contestedMatchCount; j++) {
    const a = playingTeams[j * 2]
    const b = playingTeams[j * 2 + 1]
    firstRound[slot].participant_a_id = a.id
    firstRound[slot].participant_b_id = b.id
    slot++
  }
  for (let j = 0; j < byeCount; j++) {
    const t = byeRecipients[j]
    firstRound[slot].participant_a_id = t.id
    firstRound[slot].participant_b_id = null
    firstRound[slot].is_bye = true
    firstRound[slot].winner_id = t.id
    if (firstRound[slot].next_bracket_id) {
      const parentIdx = Math.floor(slot / 2)
      if (slot % 2 === 0) {
        nextRound[parentIdx].participant_a_id = t.id
      } else {
        nextRound[parentIdx].participant_b_id = t.id
      }
    }
    slot++
  }

  // Flatten and create matches for non-bye brackets
  for (const roundSlots of roundBrackets) {
    for (const bracket of roundSlots) {
      brackets.push(bracket)
      if (!bracket.is_bye) {
        const match: MatchStub = {
          id: uuid(),
          event_id: eventId,
          bracket_id: bracket.id,
          participant_a_id: bracket.participant_a_id,
          participant_b_id: bracket.participant_b_id,
          status: 'scheduled',
        }
        matches.push(match)
      }
    }
  }

  return { brackets, matches }
}

/** When team count is greater than this, round robin is split into two pools plus crossover semis + final. */
export const ROUND_ROBIN_SPLIT_THRESHOLD = 10

// Round Robin within one pool / single table
function buildRoundRobinPool(
  eventId: string,
  participants: Participant[],
  round: number,
  bracketType: string,
): { brackets: BracketNode[]; matches: MatchStub[] } {
  const brackets: BracketNode[] = []
  const matches: MatchStub[] = []
  let matchOrder = 0

  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const bracket: BracketNode = {
        id: uuid(),
        event_id: eventId,
        round,
        match_order: matchOrder++,
        participant_a_id: participants[i].id,
        participant_b_id: participants[j].id,
        winner_id: null,
        next_bracket_id: null,
        is_bye: false,
        bracket_type: bracketType,
        loser_next_bracket_id: null,
        loser_slot: null,
      }
      brackets.push(bracket)
      matches.push({
        id: uuid(),
        event_id: eventId,
        bracket_id: bracket.id,
        participant_a_id: participants[i].id,
        participant_b_id: participants[j].id,
        status: 'scheduled',
      })
    }
  }

  return { brackets, matches }
}

/** Single round-robin table (≤ ROUND_ROBIN_SPLIT_THRESHOLD teams). */
function buildRoundRobin(
  eventId: string,
  participants: Participant[],
): { brackets: BracketNode[]; matches: MatchStub[] } {
  return buildRoundRobinPool(eventId, participants, 1, 'round_robin')
}

/**
 * Two pools (rounds 1–2), each plays full RR, then crossover semis (typical 1A vs 2B / 1B vs 2A)
 * and final. Semis/final start unassigned — use PATCH …/brackets/matches/:id/participants after pool play.
 */
function buildSplitRoundRobinWithCrossover(
  eventId: string,
  participants: Participant[],
): { brackets: BracketNode[]; matches: MatchStub[] } {
  const seeded = seedParticipants(participants)
  const n = seeded.length
  const nA = Math.ceil(n / 2)
  const poolA = seeded.slice(0, nA)
  const poolB = seeded.slice(nA)

  if (poolA.length < 2 || poolB.length < 2) {
    throw new Error('Split round robin requires at least 2 teams in each pool')
  }

  const { brackets: bA, matches: mA } = buildRoundRobinPool(eventId, poolA, 1, 'rr_pool_a')
  const { brackets: bB, matches: mB } = buildRoundRobinPool(eventId, poolB, 2, 'rr_pool_b')

  const finalBracket: BracketNode = {
    id: uuid(),
    event_id: eventId,
    round: 4,
    match_order: 0,
    participant_a_id: null,
    participant_b_id: null,
    winner_id: null,
    next_bracket_id: null,
    is_bye: false,
    bracket_type: 'knockout_final',
    loser_next_bracket_id: null,
    loser_slot: null,
  }

  const semi1: BracketNode = {
    id: uuid(),
    event_id: eventId,
    round: 3,
    match_order: 0,
    participant_a_id: null,
    participant_b_id: null,
    winner_id: null,
    next_bracket_id: finalBracket.id,
    is_bye: false,
    bracket_type: 'crossover_semi',
    loser_next_bracket_id: null,
    loser_slot: null,
  }
  const semi2: BracketNode = {
    id: uuid(),
    event_id: eventId,
    round: 3,
    match_order: 1,
    participant_a_id: null,
    participant_b_id: null,
    winner_id: null,
    next_bracket_id: finalBracket.id,
    is_bye: false,
    bracket_type: 'crossover_semi',
    loser_next_bracket_id: null,
    loser_slot: null,
  }

  const matchesKo: MatchStub[] = [
    {
      id: uuid(),
      event_id: eventId,
      bracket_id: semi1.id,
      participant_a_id: null,
      participant_b_id: null,
      status: 'scheduled',
    },
    {
      id: uuid(),
      event_id: eventId,
      bracket_id: semi2.id,
      participant_a_id: null,
      participant_b_id: null,
      status: 'scheduled',
    },
    {
      id: uuid(),
      event_id: eventId,
      bracket_id: finalBracket.id,
      participant_a_id: null,
      participant_b_id: null,
      status: 'scheduled',
    },
  ]

  return {
    brackets: [...bA, ...bB, semi1, semi2, finalBracket],
    matches: [...mA, ...mB, ...matchesKo],
  }
}

/**
 * Double Elimination.
 *
 * The winners bracket is exactly buildSingleElim(), untouched. What makes
 * this double elimination -- routing a WB loser into a second life, and
 * eventually a grand final between both bracket champions -- lives entirely
 * in how the losers bracket is constructed and cross-wired to it.
 *
 * Two forward pointers per bracket node: `next_bracket_id` (existing, where
 * the WINNER goes -- untouched, still consumed by advanceWinner exactly as
 * before) and `loser_next_bracket_id` + `loser_slot` (new, where the LOSER
 * goes -- only ever set on winners-bracket nodes here).
 *
 * LB construction is a queue simulation, not a closed-form per-round formula:
 * closed forms assume every WB round contributes a clean power-of-two count
 * of losers, which breaks the moment WB round 1 has byes (an odd number of
 * real WB-R1 matches is possible whenever team count isn't a power of two).
 * The queue approach instead: for each WB round in turn, drops that round's
 * real losers into a running queue, pairs the queue two at a time into this
 * round's LB matches, and -- if the queue is odd -- carries the leftover
 * entrant forward untouched (an implicit bye) rather than forcing a pairing
 * that doesn't exist yet. This self-corrects at every step regardless of
 * how uneven byes make the arriving counts, and total match count is
 * invariant under any such pair-and-carry reduction, so this always
 * terminates at exactly one LB finalist.
 *
 * Two participants is a degenerate case: with nobody else for a loser to
 * face, "double elimination" has no losers-bracket structure to offer beyond
 * "play again," which nothing else in this codebase models either (round
 * robin doesn't rematch, single elim doesn't reset). Falls back to plain
 * single elimination rather than fabricating a hollow losers bracket.
 */
export function buildDoubleElim(
  eventId: string,
  participants: Participant[],
): { brackets: BracketNode[]; matches: MatchStub[] } {
  const seeded = seedParticipants(participants)
  const size = nextPowerOfTwo(seeded.length)
  const totalRounds = Math.log2(size)

  const { brackets: winnersBrackets, matches: winnersMatches } = buildSingleElim(
    eventId,
    participants,
  )
  winnersBrackets.forEach((b) => (b.bracket_type = 'winners'))

  if (totalRounds < 2) {
    return { brackets: winnersBrackets, matches: winnersMatches }
  }

  const wbByRound = new Map<number, BracketNode[]>()
  for (const b of winnersBrackets) {
    const list = wbByRound.get(b.round) ?? []
    list.push(b)
    wbByRound.set(b.round, list)
  }
  for (const list of wbByRound.values()) list.sort((a, b) => a.match_order - b.match_order)

  const losersBrackets: BracketNode[] = []
  const losersMatches: MatchStub[] = []
  let lbRoundNum = 0

  type LbEntrant =
    | { kind: 'wb_loser'; bracket: BracketNode }
    | { kind: 'lb_winner'; bracket: BracketNode }

  function makeLbNode(): BracketNode {
    const node: BracketNode = {
      id: uuid(),
      event_id: eventId,
      round: 1000 + lbRoundNum,
      match_order: losersBrackets.length,
      participant_a_id: null,
      participant_b_id: null,
      winner_id: null,
      next_bracket_id: null,
      is_bye: false,
      bracket_type: 'losers',
      loser_next_bracket_id: null,
      loser_slot: null,
    }
    losersBrackets.push(node)
    losersMatches.push({
      id: uuid(),
      event_id: eventId,
      bracket_id: node.id,
      participant_a_id: null,
      participant_b_id: null,
      status: 'scheduled',
    })
    return node
  }

  // Points `entrant`'s producing bracket at `target`'s given slot -- via the
  // existing next_bracket_id (if it's an LB match's own winner propagating,
  // reusing the same match_order-parity mechanism advanceWinner already
  // implements for winners-bracket nodes) or the new loser_next_bracket_id
  // (if it's a WB match's loser dropping in for the first time).
  function wireSource(entrant: LbEntrant, target: BracketNode, slot: 'a' | 'b') {
    if (entrant.kind === 'wb_loser') {
      entrant.bracket.loser_next_bracket_id = target.id
      entrant.bracket.loser_slot = slot
    } else {
      entrant.bracket.next_bracket_id = target.id
      // match_order on an LB node is meaningful only as a slot indicator for
      // wherever it lands next -- overwritten here rather than left at its
      // creation-time value, since a carried-forward (bye) entrant's eventual
      // pairing parity can't be known until it's actually paired.
      entrant.bracket.match_order = slot === 'a' ? 0 : 1
    }
  }

  function pairRound(queue: LbEntrant[]): LbEntrant[] {
    lbRoundNum += 1
    const next: LbEntrant[] = []
    let i = 0
    while (i + 1 < queue.length) {
      const node = makeLbNode()
      wireSource(queue[i], node, 'a')
      wireSource(queue[i + 1], node, 'b')
      next.push({ kind: 'lb_winner', bracket: node })
      i += 2
    }
    if (i < queue.length) next.push(queue[i]) // odd leftover carries forward untouched
    return next
  }

  let queue: LbEntrant[] = []
  for (let d = 1; d < totalRounds; d++) {
    const wbLosersD = (wbByRound.get(d) ?? []).filter((b) => !b.is_bye)
    queue.push(...wbLosersD.map((bracket): LbEntrant => ({ kind: 'wb_loser', bracket })))
    queue = pairRound(queue)
  }
  while (queue.length > 1) {
    queue = pairRound(queue)
  }
  // Every real WB match before the final produces exactly one entrant here
  // eventually, so for any n >= 3 (totalRounds >= 2) the queue always drains
  // to exactly one survivor.
  const lbSurvivor = queue[0]

  const wbFinal = (wbByRound.get(totalRounds) ?? [])[0]
  if (!wbFinal) throw new Error('Winners bracket final not found')

  // Losers-bracket final: the LB survivor vs the WB final's loser -- the
  // WB final's loser gets exactly one more life, same as anyone else's first
  // WB loss, just arriving here directly instead of via the regular queue.
  lbRoundNum += 1
  const lbFinal = makeLbNode()
  lbFinal.bracket_type = 'losers_final'
  wireSource(lbSurvivor, lbFinal, 'a')
  wbFinal.loser_next_bracket_id = lbFinal.id
  wbFinal.loser_slot = 'b'

  // Grand Final: WB champion vs LB champion.
  const grandFinal: BracketNode = {
    id: uuid(),
    event_id: eventId,
    round: 9999,
    match_order: 0,
    participant_a_id: null,
    participant_b_id: null,
    winner_id: null,
    next_bracket_id: null,
    is_bye: false,
    bracket_type: 'grand_final',
    loser_next_bracket_id: null,
    loser_slot: null,
  }
  wbFinal.next_bracket_id = grandFinal.id // wbFinal.match_order is already 0 -> slot a
  lbFinal.next_bracket_id = grandFinal.id
  lbFinal.match_order = 1 // -> slot b

  const grandFinalMatch: MatchStub = {
    id: uuid(),
    event_id: eventId,
    bracket_id: grandFinal.id,
    participant_a_id: null,
    participant_b_id: null,
    status: 'scheduled',
  }

  // lbFinal is already inside losersBrackets/losersMatches -- makeLbNode() pushed it.
  return {
    brackets: [...winnersBrackets, ...losersBrackets, grandFinal],
    matches: [...winnersMatches, ...losersMatches, grandFinalMatch],
  }
}

export async function generateBracket(
  eventId: string,
  participantIds: string[],
  format: BracketFormat,
  seeds?: Record<string, number>,
): Promise<{ success: boolean; bracketCount: number; matchCount: number }> {
  const participants: Participant[] = participantIds.map((id) => ({
    id,
    seed: seeds?.[id],
  }))

  if (participants.length < 2) {
    throw new Error('At least 2 participants required to generate a bracket')
  }

  let brackets: BracketNode[]
  let matches: MatchStub[]

  switch (format) {
    case 'single_elim':
      ;({ brackets, matches } = buildSingleElim(eventId, participants))
      break
    case 'double_elim':
      ;({ brackets, matches } = buildDoubleElim(eventId, participants))
      break
    case 'round_robin':
      ;({ brackets, matches } =
        participants.length > ROUND_ROBIN_SPLIT_THRESHOLD
          ? buildSplitRoundRobinWithCrossover(eventId, participants)
          : buildRoundRobin(eventId, participants))
      break
    default:
      throw new Error(`Unknown format: ${format}`)
  }

  // Clear existing brackets and matches for this event
  await supabase.from('matches').delete().eq('event_id', eventId)
  await supabase.from('brackets').delete().eq('event_id', eventId)

  // Insert brackets first (matches reference bracket ids)
  const { error: bracketError } = await supabase.from('brackets').insert(brackets)
  if (bracketError) throw new Error(`Failed to insert brackets: ${bracketError.message}`)

  const { error: matchError } = await supabase.from('matches').insert(matches)
  if (matchError) throw new Error(`Failed to insert matches: ${matchError.message}`)

  // Do NOT change event status here — the bracket is generated but the event stays
  // in its current status (draft/registration) until the organizer explicitly clicks Start.

  return { success: true, bracketCount: brackets.length, matchCount: matches.length }
}

/**
 * Writes `participantId` into `field` of the bracket row at `targetBracketId`
 * (and its corresponding match row), refusing to overwrite a downstream match
 * that has already been played. Shared by winner-routing and loser-routing --
 * both are "place this participant into that other bracket's slot," differing
 * only in which participant and which field.
 */
async function routeParticipantForward(
  targetBracketId: string,
  field: 'participant_a_id' | 'participant_b_id',
  participantId: string,
): Promise<void> {
  const { data: targetBracket } = await supabase
    .from('brackets')
    .select('*')
    .eq('id', targetBracketId)
    .single()
  if (!targetBracket) return

  // Refuse to rewrite a downstream match that has already been played.
  // Overwriting its participant used to leave the bracket internally
  // inconsistent: the next round would name a team that never played it, while
  // its scores, box score and recorded winner still belonged to the old team.
  const { data: downstream } = await supabase
    .from('matches')
    .select('id, status')
    .eq('bracket_id', targetBracketId)

  const alreadyPlayed = (downstream ?? []).filter(
    (m) =>
      (m as { status?: string }).status === 'live' ||
      (m as { status?: string }).status === 'completed',
  )
  if (alreadyPlayed.length > 0) {
    const current = (targetBracket as Record<string, unknown>)[field]
    if (current && current !== participantId) {
      throw new Error(
        'The next round has already started with a different team. ' +
          'Reset that match before changing this result.',
      )
    }
    return
  }

  await supabase.from('brackets').update({ [field]: participantId }).eq('id', targetBracketId)
  await supabase.from('matches').update({ [field]: participantId }).eq('bracket_id', targetBracketId)
}

// Called after a match completes - advances winner (and, in double
// elimination, routes the loser into their next losers-bracket match) in the
// bracket, then checks whether the event is fully decided.
export async function advanceWinner(matchId: string, winnerId: string): Promise<void> {
  const { data: match } = await supabase
    .from('matches')
    .select('bracket_id, event_id')
    .eq('id', matchId)
    .single()

  if (!match?.bracket_id) return

  await supabase.from('brackets').update({ winner_id: winnerId }).eq('id', match.bracket_id)

  const { data: bracket } = await supabase
    .from('brackets')
    .select(
      'next_bracket_id, match_order, round, bracket_type, participant_a_id, participant_b_id, loser_next_bracket_id, loser_slot',
    )
    .eq('id', match.bracket_id)
    .single()

  // Double elimination only: route the loser into their losers-bracket slot.
  // Independent of the winner-routing below -- a winners-bracket match in a
  // double-elim event has both a next_bracket_id (winner) and a
  // loser_next_bracket_id (loser); every other format only ever has the
  // former, so this is a no-op everywhere else.
  if (bracket?.loser_next_bracket_id && bracket.loser_slot) {
    const loserId =
      bracket.participant_a_id === winnerId ? bracket.participant_b_id : bracket.participant_a_id
    if (loserId) {
      const loserField = bracket.loser_slot === 'a' ? 'participant_a_id' : 'participant_b_id'
      await routeParticipantForward(bracket.loser_next_bracket_id, loserField, loserId)
    }
  }

  if (!bracket?.next_bracket_id) {
    const t = bracket?.bracket_type ?? ''
    const isPoolRoundRobin = ['round_robin', 'rr_pool_a', 'rr_pool_b'].includes(t)
    if (!isPoolRoundRobin) {
      await supabase.from('events').update({ status: 'completed' }).eq('id', match.event_id)
    }
    return
  }

  const winnerField = bracket.match_order % 2 === 0 ? 'participant_a_id' : 'participant_b_id'
  await routeParticipantForward(bracket.next_bracket_id, winnerField, winnerId)
}
