/**
 * Automated insights (player trends + team streaks).
 * Same logic as `supabase/functions/compute-insights`; runs in Node so Edge deploy/DNS is not required.
 */
import supabase from '../utils/supabase'

interface PlayerGameStats {
  athlete_id: string
  sport: string
  stats: Record<string, number>
}

const INSIGHT_THRESHOLD = 0.1

const KEY_STATS: Record<string, string[]> = {
  basketball: ['total_points', 'total_rebounds', 'total_assists', 'total_steals'],
  volleyball: ['kills', 'aces', 'digs', 'blocks'],
  // `sets_won` was never written into a player's stat blob, so that rule could
  // never fire. Winners are recorded per rally and are a real per-player stat.
  'table-tennis': ['pts_scored', 'winners'],
}

export const STAT_LABELS: Record<string, string> = {
  total_points: 'PPG',
  total_rebounds: 'RPG',
  total_assists: 'APG',
  total_steals: 'SPG',
  turnovers: 'TOPG',
  kills: 'Kills',
  aces: 'Aces',
  digs: 'Digs',
  blocks: 'Blocks',
  pts_scored: 'Points Scored',
  winners: 'Winners',
}

/** Standout thresholds for a single debut/first game to generate a highlight insight. */
const STANDOUT_THRESHOLDS: Record<string, { key: string; min: number; label: string }[]> = {
  basketball: [
    { key: 'total_points', min: 10, label: 'points' },
    { key: 'total_rebounds', min: 8, label: 'rebounds' },
    { key: 'total_assists', min: 5, label: 'assists' },
  ],
  volleyball: [
    { key: 'kills', min: 5, label: 'kills' },
    { key: 'aces', min: 3, label: 'aces' },
  ],
  'table-tennis': [{ key: 'pts_scored', min: 11, label: 'points scored' }],
}

function statBag(stats: unknown): Record<string, number> {
  if (!stats || typeof stats !== 'object') return {}
  const o = stats as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(o)) {
    const n = Number(v)
    if (!Number.isNaN(n)) out[k] = n
  }
  return out
}

async function fetchAthleteName(athleteId: string): Promise<string> {
  const { data: athlete } = await supabase
    .from('athletes')
    .select('profile:profiles!athletes_profile_id_fkey(full_name)')
    .eq('id', athleteId)
    .single()

  const prRaw = (athlete as { profile?: { full_name?: string } | { full_name?: string }[] } | null)
    ?.profile
  const pr = Array.isArray(prRaw) ? prRaw[0] : prRaw
  return pr?.full_name ?? 'Athlete'
}

/** Write an insight row with upsert (deduped by entity/type/sport/season). */
async function upsertInsight(payload: {
  entity_type: 'player' | 'team'
  entity_id: string
  sport: string
  season_id: string
  insight_text: string
  insight_type: string
  data: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabase.from('insights').upsert(
    {
      ...payload,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: 'entity_type,entity_id,sport,season_id,insight_type' },
  )
  if (error) console.error('[computeInsights] upsert:', error.message)
}

/**
 * Remove an insight that no longer holds. Recomputation only ever wrote rows,
 * so a "trending up 40%" survived the very correction that removed the points —
 * it just sat there until its 7-day expiry.
 */
async function clearInsight(
  entityType: 'player' | 'team',
  entityId: string,
  sport: string,
  seasonId: string,
  insightType: string,
): Promise<void> {
  const { error } = await supabase
    .from('insights')
    .delete()
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('sport', sport)
    .eq('season_id', seasonId)
    .eq('insight_type', insightType)
  if (error) console.error('[computeInsights] clear:', error.message)
}

/** A short clause naming 1-2 supporting stats beyond whichever one triggered the headline,
 *  plus a shooting split for basketball — turns "24 points" into a fuller box-score sentence. */
function debutSecondaryClause(
  sport: string,
  stats: Record<string, number>,
  triggerKey: string,
): string {
  if (sport === 'basketball') {
    const parts: string[] = []
    if (stats.total_rebounds)
      parts.push(`${stats.total_rebounds} rebound${stats.total_rebounds === 1 ? '' : 's'}`)
    if (stats.total_assists)
      parts.push(`${stats.total_assists} assist${stats.total_assists === 1 ? '' : 's'}`)
    if (stats.total_steals)
      parts.push(`${stats.total_steals} steal${stats.total_steals === 1 ? '' : 's'}`)
    if (stats.total_blocks)
      parts.push(`${stats.total_blocks} block${stats.total_blocks === 1 ? '' : 's'}`)
    let clause = parts.length ? ` with ${parts.slice(0, 2).join(' and ')}` : ''
    if (stats.fg_attempted)
      clause += `${clause ? ',' : ''} shooting ${stats.fg_made ?? 0}-of-${stats.fg_attempted} from the field`
    return clause
  }
  if (sport === 'volleyball') {
    const parts: string[] = []
    if (triggerKey !== 'kills' && stats.kills) parts.push(`${stats.kills} kills`)
    if (triggerKey !== 'aces' && stats.aces) parts.push(`${stats.aces} aces`)
    if (stats.digs) parts.push(`${stats.digs} digs`)
    if (stats.blocks) parts.push(`${stats.blocks} blocks`)
    return parts.length ? ` with ${parts.slice(0, 2).join(' and ')}` : ''
  }
  if (sport === 'table-tennis') {
    const parts: string[] = []
    if (triggerKey !== 'winners' && stats.winners) parts.push(`${stats.winners} winners`)
    if (triggerKey !== 'aces' && stats.aces) parts.push(`${stats.aces} aces`)
    if (stats.errors) parts.push(`${stats.errors} unforced errors`)
    return parts.length ? ` (${parts.slice(0, 2).join(', ')})` : ''
  }
  return ''
}

/** Generate a standout highlight when a player has exactly 1 game logged this season. */
async function computeDebutStandout(
  athleteId: string,
  sport: string,
  seasonId: string,
  gameStats: Record<string, number>,
  matchId: string,
): Promise<void> {
  const name = await fetchAthleteName(athleteId)
  const thresholds = STANDOUT_THRESHOLDS[sport]

  if (thresholds) {
    for (const { key, min, label } of thresholds) {
      const val = gameStats[key] ?? 0
      if (val >= min) {
        const secondary = debutSecondaryClause(sport, gameStats, key)
        await upsertInsight({
          entity_type: 'player',
          entity_id: athleteId,
          sport,
          season_id: seasonId,
          insight_text: `${name} recorded ${val} ${label} in their opening game${secondary}.`,
          insight_type: 'debut_standout',
          data: {
            stat_key: key,
            value: val,
            threshold: min,
            full_stats: gameStats,
            match_id: matchId,
          },
        })
        return
      }
    }
  }

  // Fallback: always write a first-game insight even when no threshold is hit
  const secondary = debutSecondaryClause(sport, gameStats, '')
  await upsertInsight({
    entity_type: 'player',
    entity_id: athleteId,
    sport,
    season_id: seasonId,
    insight_text: secondary
      ? `${name} appeared in their first game of the season${secondary}.`
      : `${name} appeared in their first game of the season.`,
    insight_type: 'debut_standout',
    data: { first_game: true, full_stats: gameStats, match_id: matchId },
  })
}

async function computePlayerInsights(matchId: string, seasonId: string): Promise<void> {
  const { data: gameStats } = await supabase
    .from('player_game_stats')
    .select('athlete_id, sport, stats')
    .eq('match_id', matchId)

  if (!gameStats || gameStats.length === 0) return

  // Confine the "last 3 games" window to completed matches in THIS season.
  // Without this the trend compared games from other seasons against the
  // current season's average.
  const { data: seasonEvents } = await supabase
    .from('events')
    .select('id')
    .eq('season_id', seasonId)
  const eventIds = (seasonEvents ?? []).map((e) => (e as { id: string }).id)
  let seasonMatchIds: string[] = []
  if (eventIds.length > 0) {
    const { data: seasonMatches } = await supabase
      .from('matches')
      .select('id')
      .in('event_id', eventIds)
      .eq('status', 'completed')
    seasonMatchIds = (seasonMatches ?? []).map((m) => (m as { id: string }).id)
  }
  if (seasonMatchIds.length === 0) return

  for (const gs of gameStats as PlayerGameStats[]) {
    const { athlete_id, sport } = gs

    const { data: last3 } = await supabase
      .from('player_game_stats')
      .select('stats')
      .eq('athlete_id', athlete_id)
      .eq('sport', sport)
      .in('match_id', seasonMatchIds)
      .order('created_at', { ascending: false })
      .limit(3)

    const { data: seasonStats } = await supabase
      .from('player_season_stats')
      .select('stats, games_played')
      .eq('athlete_id', athlete_id)
      .eq('season_id', seasonId)
      .single()

    // Single-game debut: generate a standout highlight instead of a trend.
    // Fall back to last3.length when player_season_stats hasn't been aggregated yet.
    const gamesPlayed = seasonStats?.games_played ?? last3?.length ?? 0
    if (!last3 || last3.length < 2 || gamesPlayed < 2) {
      if (gamesPlayed >= 1) {
        await computeDebutStandout(athlete_id, sport, seasonId, statBag(gs.stats), matchId)
      }
      continue
    }

    const agg = statBag(seasonStats!.stats)
    const gp = seasonStats!.games_played
    const keyStats = KEY_STATS[sport] ?? []

    // Pick the single most dramatic stat rather than writing one upsert per
    // stat in the loop below. All of them target the same unique key
    // (entity_type, entity_id, sport, season_id, insight_type) — upserting
    // inside the loop meant only the LAST-iterated stat's verdict ever
    // survived (total_steals for basketball, blocks for volleyball, winners
    // for table tennis), so an athlete trending +40% in points got no
    // insight at all if their steals happened to be flat.
    let best: { statKey: string; delta: number; rolling3Avg: number; seasonAvg: number } | null =
      null
    for (const statKey of keyStats) {
      const seasonAvg = (agg[statKey] ?? 0) / gp
      if (seasonAvg === 0) continue

      const rolling3Avg =
        last3.reduce((sum: number, g: { stats: unknown }) => sum + statBag(g.stats)[statKey], 0) /
        last3.length

      const delta = (rolling3Avg - seasonAvg) / seasonAvg
      if (!best || Math.abs(delta) > Math.abs(best.delta)) {
        best = { statKey, delta, rolling3Avg, seasonAvg }
      }
    }

    if (best && Math.abs(best.delta) >= INSIGHT_THRESHOLD) {
      const { statKey, delta, rolling3Avg, seasonAvg } = best
      const direction = delta > 0 ? 'trending_up' : 'trending_down'
      const label = STAT_LABELS[statKey] ?? statKey
      const pct = Math.abs(Math.round(delta * 100))
      const name = await fetchAthleteName(athlete_id)
      const direction_text = delta > 0 ? 'trending +' : 'down '
      const insight_text =
        `${name} is ${direction_text}${pct}% in ${label} over the last ${last3.length} games` +
        ` — averaging ${rolling3Avg.toFixed(1)} per game vs a ${seasonAvg.toFixed(1)} season average.`

      await upsertInsight({
        entity_type: 'player',
        entity_id: athlete_id,
        sport,
        season_id: seasonId,
        insight_text,
        insight_type: direction,
        data: {
          stat_key: statKey,
          season_avg: seasonAvg,
          rolling_avg: rolling3Avg,
          delta_pct: pct,
          match_id: matchId,
        },
      })

      // The opposite trend can no longer be true.
      await clearInsight(
        'player',
        athlete_id,
        sport,
        seasonId,
        direction === 'trending_up' ? 'trending_down' : 'trending_up',
      )
    } else {
      // No stat cleared the threshold — drop any stale trend claim rather
      // than leaving it to expire on its own a week later.
      await clearInsight('player', athlete_id, sport, seasonId, 'trending_up')
      await clearInsight('player', athlete_id, sport, seasonId, 'trending_down')
    }
  }
}

async function computeTeamInsights(matchId: string, seasonId: string): Promise<void> {
  const { data: match } = await supabase
    .from('matches')
    .select('participant_a_id, participant_b_id, event_id')
    .eq('id', matchId)
    .single()

  if (!match) return

  const { data: event } = await supabase
    .from('events')
    .select('sport')
    .eq('id', match.event_id)
    .single()

  if (!event) return

  const teamIds = [match.participant_a_id, match.participant_b_id].filter(Boolean) as string[]

  const { data: seasonEvents } = await supabase
    .from('events')
    .select('id')
    .eq('season_id', seasonId)
  const eventIds = (seasonEvents ?? []).map((e: { id: string }) => e.id)
  if (eventIds.length === 0) return

  for (const teamId of teamIds) {
    const { data: tss } = await supabase
      .from('team_season_stats')
      .select('wins, losses, stats')
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .single()

    if (!tss) continue

    const { data: team } = await supabase.from('teams').select('name').eq('id', teamId).single()

    const teamName = (team as { name: string } | null)?.name ?? 'Team'

    const { data: recentMatches } = await supabase
      .from('matches')
      .select('id, bracket_id, created_at')
      .eq('status', 'completed')
      .in('event_id', eventIds)
      .not('bracket_id', 'is', null)
      .or(`participant_a_id.eq.${teamId},participant_b_id.eq.${teamId}`)
      .order('created_at', { ascending: false })
      .limit(16)

    const inSeason = (recentMatches ?? []).filter((r: { bracket_id: string | null }) =>
      Boolean(r.bracket_id),
    )
    const bracketIds = [
      ...new Set(inSeason.map((r) => r.bracket_id).filter((id): id is string => Boolean(id))),
    ]

    if (bracketIds.length < 1) continue

    const { data: brackets } = await supabase
      .from('brackets')
      .select('id, winner_id')
      .in('id', bracketIds)

    const winnerByBracket = new Map(
      (brackets ?? []).map((b: { id: string; winner_id: string | null }) => [b.id, b.winner_id]),
    )

    let streak = 0
    for (const m of inSeason) {
      const w = m.bracket_id ? winnerByBracket.get(m.bracket_id) : null
      if (w === teamId) streak++
      else break
    }

    if (streak >= 2) {
      await upsertInsight({
        entity_type: 'team',
        entity_id: teamId,
        sport: event.sport,
        season_id: seasonId,
        insight_text: `${teamName} is on a ${streak}-game win streak, improving to ${tss.wins}-${tss.losses} on the season.`,
        insight_type: 'streak',
        data: { wins: tss.wins, losses: tss.losses, streak, match_id: matchId },
      })
    } else if (streak === 1 && tss.wins === 1) {
      // Opponent is already on hand from the match row fetched at the top of this
      // function — no extra lookup needed for the other team's name.
      const opponentId =
        match.participant_a_id === teamId ? match.participant_b_id : match.participant_a_id
      let opponentName = 'their opponent'
      if (opponentId) {
        const { data: opp } = await supabase
          .from('teams')
          .select('name')
          .eq('id', opponentId)
          .maybeSingle()
        if (opp?.name) opponentName = opp.name
      }
      await upsertInsight({
        entity_type: 'team',
        entity_id: teamId,
        sport: event.sport,
        season_id: seasonId,
        insight_text: `${teamName} won their opening match of the season, defeating ${opponentName}.`,
        insight_type: 'first_win',
        data: { wins: tss.wins, losses: tss.losses, opponent_id: opponentId, match_id: matchId },
      })
      await clearInsight('team', teamId, event.sport, seasonId, 'streak')
    } else {
      // Streak broken (or invalidated by a corrected result) — remove the claim.
      await clearInsight('team', teamId, event.sport, seasonId, 'streak')
      if (tss.wins !== 1) await clearInsight('team', teamId, event.sport, seasonId, 'first_win')
    }
  }
}

/** Run after a match ends / finalize — writes `insights` rows using service-role DB client. */
export async function computeInsightsForMatch(matchId: string, seasonId: string): Promise<void> {
  await Promise.all([
    computePlayerInsights(matchId, seasonId),
    computeTeamInsights(matchId, seasonId),
  ])
}
