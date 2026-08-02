import supabase from '../utils/supabase'

/** Resolve a display name for a match participant — a team name, or an individual athlete's profile name. */
export async function resolveParticipantDisplayName(participantId: string | null): Promise<string> {
  if (!participantId) return '—'
  const { data: team } = await supabase.from('teams').select('name').eq('id', participantId).maybeSingle()
  if (team?.name) return team.name

  const { data: ath } = await supabase.from('athletes').select('profile_id').eq('id', participantId).maybeSingle()
  if (ath?.profile_id) {
    const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', ath.profile_id).maybeSingle()
    if (prof?.full_name) return prof.full_name
  }
  return `Participant ${participantId.slice(0, 8)}…`
}

/** Normalize embedded `athletes.profile` from Supabase (PostgREST typing can vary). */
function normalizeRosterAthlete(
  row: unknown
): { id: string; profile: { full_name: string } | null } | null {
  if (!row || typeof row !== 'object') return null
  const r = row as { id?: string; profile?: unknown }
  if (!r.id) return null
  const pRaw = r.profile
  const pObj = Array.isArray(pRaw) ? pRaw[0] : pRaw
  if (pObj && typeof pObj === 'object' && 'full_name' in pObj) {
    const fn = (pObj as { full_name?: string }).full_name
    return { id: r.id, profile: { full_name: typeof fn === 'string' ? fn : String(fn ?? '') } }
  }
  return { id: r.id, profile: null }
}

/** All roster athletes for a match participant (team via team_members, else a single athlete id for individual entries). */
async function rosterAthletesForMatchParticipant(participantId: string | null): Promise<
  Array<{ athlete_id: string; athlete: { id: string; profile: { full_name: string } | null } | null }>
> {
  if (!participantId) return []

  const { data: tmRows } = await supabase
    .from('team_members')
    .select(
      'athlete_id, lineup_slot, athlete:athletes(id, profile:profiles!athletes_profile_id_fkey(full_name))',
    )
    .eq('team_id', participantId)

  if (tmRows && tmRows.length > 0) {
    const sorted = [...tmRows].sort((a, b) => {
      const la = Number(a.lineup_slot ?? 999)
      const lb = Number(b.lineup_slot ?? 999)
      if (la !== lb) return la - lb
      const ra = normalizeRosterAthlete(a.athlete)
      const rb = normalizeRosterAthlete(b.athlete)
      return (ra?.profile?.full_name ?? '').localeCompare(rb?.profile?.full_name ?? '')
    })
    return sorted
      .filter((r) => r.athlete_id)
      .map((r) => ({
        athlete_id: r.athlete_id as string,
        athlete: normalizeRosterAthlete(r.athlete),
      }))
  }

  const { data: solo } = await supabase
    .from('athletes')
    .select('id, profile:profiles!athletes_profile_id_fkey(full_name)')
    .eq('id', participantId)
    .maybeSingle()

  if (solo?.id) {
    return [
      {
        athlete_id: solo.id,
        athlete: normalizeRosterAthlete(solo),
      },
    ]
  }

  return []
}

function ttSlotsPerSide(ttFormat: string | null | undefined): number {
  return ttFormat === 'doubles' ? 2 : 1
}

/**
 * Table tennis match review should list only active competitors (1/side singles, 2/side doubles),
 * not full squads. Prefer persisted `matches.active_lineup`; fallback to first roster slots by `lineup_slot`.
 */
function filterTableTennisRosterSide(
  roster: Array<{ athlete_id: string; athlete: { id: string; profile: { full_name: string } | null } | null }>,
  side: 'a' | 'b',
  activeLineup: Record<string, unknown> | null | undefined,
  ttFormat: string | null | undefined,
): Array<{ athlete_id: string; athlete: { id: string; profile: { full_name: string } | null } | null }> {
  const max = ttSlotsPerSide(ttFormat)
  const key = side === 'a' ? 'a' : 'b'
  const raw = activeLineup?.[key]
  const lineupIds = Array.isArray(raw)
    ? (raw as unknown[])
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .slice(0, max)
    : []
  const byId = new Map(roster.map((r) => [r.athlete_id, r]))

  if (lineupIds.length > 0) {
    const picked = lineupIds.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row))
    if (picked.length === lineupIds.length && picked.length > 0) return picked
    if (picked.length > 0) return picked.slice(0, max)
  }

  return roster.slice(0, max)
}

type ReviewPlayerTeamMeta = {
  participant_side: 'a' | 'b'
  team_id: string | null
  team_name: string
}

/** Map athletes to bracket side using match participant ids + team memberships. */
async function reviewTeamMetaByAthleteId(
  athleteIds: string[],
  participantAId: string | null,
  participantBId: string | null,
  nameA: string,
  nameB: string,
): Promise<Map<string, ReviewPlayerTeamMeta>> {
  const uniq = [...new Set(athleteIds.filter(Boolean))]
  const meta = new Map<string, ReviewPlayerTeamMeta>()
  if (uniq.length === 0) return meta

  for (const id of uniq) {
    if (participantAId && id === participantAId) {
      meta.set(id, {
        participant_side: 'a',
        team_id: participantAId,
        team_name: nameA,
      })
    }
    if (participantBId && id === participantBId) {
      meta.set(id, {
        participant_side: 'b',
        team_id: participantBId,
        team_name: nameB,
      })
    }
  }

  const teamParticipants = [participantAId, participantBId].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  )
  const needTeamLookup = uniq.filter((id) => !meta.has(id))
  if (needTeamLookup.length === 0 || teamParticipants.length === 0) return meta

  const { data: memberships } = await supabase
    .from('team_members')
    .select('athlete_id, team_id')
    .in('athlete_id', needTeamLookup)
    .in('team_id', teamParticipants)

  for (const m of memberships ?? []) {
    const aid = m.athlete_id as string
    const tid = m.team_id as string
    if (participantAId && tid === participantAId) {
      meta.set(aid, { participant_side: 'a', team_id: participantAId, team_name: nameA })
    } else if (participantBId && tid === participantBId) {
      meta.set(aid, { participant_side: 'b', team_id: participantBId, team_name: nameB })
    }
  }

  return meta
}

/** One action can feed several stat keys. Each entry is [statKey, amount]. */
type StatContribution = readonly [string, number]

export function actionTypeToStatKeys(sport: string, actionType: string): readonly StatContribution[] {
  const map: Record<string, Record<string, readonly StatContribution[]>> = {
    basketball: {
      // A made free throw is worth a point. It previously incremented only
      // `ft_made`, so every player's `total_points` excluded their free throws.
      point_1: [['total_points', 1], ['ft_made', 1], ['ft_attempted', 1]],
      point_2: [['total_points', 2], ['fg_made', 1], ['fg_attempted', 1]],
      point_3: [['total_points', 3], ['three_made', 1], ['three_attempted', 1], ['fg_made', 1], ['fg_attempted', 1]],
      miss_1: [['ft_attempted', 1]],
      miss_2: [['fg_attempted', 1]],
      miss_3: [['three_attempted', 1], ['fg_attempted', 1]],
      rebound: [['total_rebounds', 1], ['def_rebounds', 1]],
      off_rebound: [['total_rebounds', 1], ['off_rebounds', 1]],
      assist: [['total_assists', 1]],
      steal: [['total_steals', 1]],
      block: [['total_blocks', 1]],
      turnover: [['turnovers', 1]],
      foul: [['fouls', 1]],
    },
    volleyball: {
      point_1: [['pts_scored', 1]],
      kill: [['kills', 1], ['pts_scored', 1], ['attacks', 1]],
      ace: [['aces', 1], ['pts_scored', 1]],
      dig: [['digs', 1]],
      block: [['blocks', 1], ['pts_scored', 1]],
      assist: [['assists', 1]],
      error: [['errors', 1], ['attacks', 1]],
      serve_error: [['serve_errors', 1], ['errors', 1]],
      reception_error: [['reception_errors', 1], ['errors', 1]],
    },
    'table-tennis': {
      point_1: [['pts_scored', 1]],
      tt_winner: [['pts_scored', 1], ['winners', 1]],
      tt_ace: [['pts_scored', 1], ['aces', 1]],
      tt_error: [['errors', 1]],
    },
  }
  return map[sport]?.[actionType] ?? []
}

/** Aggregate per-athlete stats from scoring_actions (the live record). */
async function computeLiveStatsByAthlete(
  matchId: string,
  sport: string,
): Promise<Record<string, Record<string, number>>> {
  const { data: actions } = await supabase
    .from('scoring_actions')
    .select('athlete_id, action_type, value')
    .eq('match_id', matchId)
    .eq('undone', false)
    .not('athlete_id', 'is', null)

  const out: Record<string, Record<string, number>> = {}
  for (const row of actions ?? []) {
    const athleteId = (row as { athlete_id?: string | null }).athlete_id
    if (!athleteId) continue
    const contributions = actionTypeToStatKeys(sport, (row as { action_type: string }).action_type)
    if (contributions.length === 0) continue
    if (!out[athleteId]) out[athleteId] = {}
    for (const [key, amount] of contributions) {
      out[athleteId][key] = (out[athleteId][key] ?? 0) + amount
    }
  }
  return out
}

/**
 * Assembles everything the Post-Game Review screen and the Match Score Sheet
 * (on-screen preview + PDF) need for one match: match/event/bracket info, the
 * period-by-period scores, the merged roster + player stats, and who scored it.
 * Shared by GET /scoring/:matchId/review and GET /reports/match/:matchId/pdf so
 * the ~150-line roster/stat merge below isn't duplicated for the PDF path.
 */
export async function getMatchReviewData(matchId: string): Promise<{
  match: any
  scores: any[]
  playerStats: unknown[]
  liveStats: Record<string, Record<string, number>>
  participantNames: { a: string; b: string }
  scorerName: string | null
} | null> {
  const { data: match } = await supabase
    .from('matches')
    .select(
      '*, event:events(name, sport, season_id, table_tennis_format), bracket:brackets(round, bracket_type, winner_id)',
    )
    .eq('id', matchId)
    .single()
  if (!match) return null

  const [scoresRes, playerStatsRes, rosterA, rosterB, nameA, nameB, scorerRes] = await Promise.all([
    supabase.from('match_scores').select('*').eq('match_id', matchId),
    supabase
      .from('player_game_stats')
      .select('*, athlete:athletes(id, profile:profiles!athletes_profile_id_fkey(full_name))')
      .eq('match_id', matchId),
    rosterAthletesForMatchParticipant(match.participant_a_id),
    rosterAthletesForMatchParticipant(match.participant_b_id),
    resolveParticipantDisplayName(match.participant_a_id),
    resolveParticipantDisplayName(match.participant_b_id),
    (match as { scored_by?: string | null }).scored_by
      ? supabase.from('profiles').select('full_name').eq('id', (match as { scored_by: string }).scored_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const sport = (match as { event?: { sport?: string } }).event?.sport ?? 'basketball'
  const ttFormatRaw =
    sport === 'table-tennis'
      ? ((match as { event?: { table_tennis_format?: string | null } }).event?.table_tennis_format ?? 'singles')
      : null
  const activeLineupRaw = (match as { active_lineup?: Record<string, unknown> | null }).active_lineup

  let rosterForA = rosterA
  let rosterForB = rosterB
  let ttAllowedAthleteIds: Set<string> | null = null
  if (sport === 'table-tennis') {
    rosterForA = filterTableTennisRosterSide(rosterA, 'a', activeLineupRaw, ttFormatRaw)
    rosterForB = filterTableTennisRosterSide(rosterB, 'b', activeLineupRaw, ttFormatRaw)
    ttAllowedAthleteIds = new Set([
      ...rosterForA.map((r) => r.athlete_id),
      ...rosterForB.map((r) => r.athlete_id),
    ])
  }

  const statsByAthlete = new Map(
    (playerStatsRes.data ?? []).map((ps) => [(ps as { athlete_id: string }).athlete_id, ps]),
  )

  const mergedPlayerStats: unknown[] = []
  const pushFromRoster = (
    roster: Awaited<ReturnType<typeof rosterAthletesForMatchParticipant>>,
    side: 'a' | 'b',
    participantIdForSide: string | null,
    teamName: string,
  ) => {
    const tm: ReviewPlayerTeamMeta = {
      participant_side: side,
      team_id: participantIdForSide,
      team_name: teamName,
    }
    for (const row of roster) {
      const existing = statsByAthlete.get(row.athlete_id)
      if (existing) {
        mergedPlayerStats.push({
          ...(existing as object),
          ...tm,
        })
        statsByAthlete.delete(row.athlete_id)
      } else {
        mergedPlayerStats.push({
          match_id: matchId,
          athlete_id: row.athlete_id,
          sport,
          stats: {},
          athlete: row.athlete,
          ...tm,
        })
      }
    }
  }
  const pidA = (match as { participant_a_id?: string | null }).participant_a_id ?? null
  const pidB = (match as { participant_b_id?: string | null }).participant_b_id ?? null

  pushFromRoster(rosterForA, 'a', pidA, nameA)
  pushFromRoster(rosterForB, 'b', pidB, nameB)

  const remainderRows = [...statsByAthlete.values()]
  const remainderIds = remainderRows.map((r) => (r as { athlete_id: string }).athlete_id)
  const remainderMeta = await reviewTeamMetaByAthleteId(remainderIds, pidA, pidB, nameA, nameB)
  for (const remainder of remainderRows) {
    const athleteId = (remainder as { athlete_id: string }).athlete_id
    if (sport === 'table-tennis' && ttAllowedAthleteIds && !ttAllowedAthleteIds.has(athleteId)) {
      continue
    }
    const sideInfo = remainderMeta.get(athleteId)
    mergedPlayerStats.push({
      ...(remainder as object),
      participant_side: sideInfo?.participant_side ?? null,
      team_id: sideInfo?.team_id ?? null,
      team_name: sideInfo?.team_name ?? 'Team',
    })
  }

  const liveStats = await computeLiveStatsByAthlete(matchId, sport)

  return {
    match,
    scores: scoresRes.data ?? [],
    playerStats: mergedPlayerStats,
    liveStats,
    participantNames: { a: nameA, b: nameB },
    scorerName: (scorerRes.data as { full_name?: string } | null)?.full_name ?? null,
  }
}
