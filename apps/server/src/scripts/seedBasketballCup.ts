/**
 * A real, completed 4-team single-elimination basketball tournament — not
 * tagged "[Showcase]" like seedShowcaseData.ts's 2-team demo — so Analytics'
 * enriched exports have something worth looking at: a full standings CSV
 * (champion/runner-up/two tied 3rd-place teams, not just a 2-row podium) and
 * a Teams CSV where "current_streak" actually varies between teams.
 *
 * Run from repo root: pnpm --filter server seed:basketball-cup
 * Requires apps/server/.env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Re-running is safe — teams/players/events are looked up by name/email
 * first, so it won't create duplicates, just refreshes scores/stats.
 */

import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const DEMO_PASSWORD = 'Intramurals2026!'
const EMAIL_DOMAIN = 'students.nu-dasma.edu.ph'
const SPORT = 'basketball' as const

const TEAMS = [
  { name: 'SBMA Blazers', department: 'SBMA' },
  { name: 'SECA Titans', department: 'SECA' },
  { name: 'SASE Warriors', department: 'SASE' },
  { name: 'SHS Eagles', department: 'SHS' },
]

const FIRST_NAMES = [
  'Miguel', 'Josef', 'Andre', 'Carlo', 'Diego', 'Marco', 'Rafael', 'Gabriel',
  'Nathan', 'Lucas', 'Ethan', 'Xavier', 'Julian', 'Adrian', 'Sean', 'Kyle',
  'Vince', 'Aaron', 'Elijah', 'Renz', 'Paolo', 'Gian', 'Mikko', 'Jarrell',
]
const LAST_NAMES = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Gonzales', 'Ramos', 'Mendoza',
  'Torres', 'Flores', 'Rivera', 'Villanueva', 'Aquino', 'Del Rosario',
  'Salazar', 'Castillo', 'Navarro', 'Domingo', 'Pascual', 'Fernandez', 'Garcia',
]
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C']

function nameFor(idx: number): string {
  return `${FIRST_NAMES[idx % FIRST_NAMES.length]} ${LAST_NAMES[(idx * 7) % LAST_NAMES.length]}`
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url?.trim() || !key?.trim()) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/server/.env')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  const { data: season, error: seasonErr } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (seasonErr || !season?.id) {
    console.error('No active season found. Create/activate one first.')
    process.exit(1)
  }
  const seasonId = season.id
  console.log(`Season: ${season.name} (${seasonId})`)

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'Admin')
    .limit(1)
    .maybeSingle()
  const adminId = adminProfile?.id ?? null

  async function ensureAthlete(opts: {
    email: string
    fullName: string
    studentId: string
    department: string
    position: string
    jerseyNumber: number
  }): Promise<{ profileId: string; athleteId: string }> {
    let profileId: string | undefined
    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email: opts.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: opts.fullName },
    })
    if (!cErr && created.user?.id) {
      profileId = created.user.id
    } else {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', opts.email)
        .maybeSingle()
      profileId = existing?.id
      if (!profileId)
        throw new Error(`Could not create or find profile for ${opts.email}: ${cErr?.message}`)
    }
    const { data: athlete, error: aErr } = await supabase
      .from('athletes')
      .upsert(
        {
          profile_id: profileId,
          student_id: opts.studentId,
          sport: SPORT,
          position: opts.position,
          jersey_number: String(opts.jerseyNumber),
          department: opts.department,
          season_status: 'active',
        },
        { onConflict: 'profile_id' },
      )
      .select('id')
      .single()
    if (aErr || !athlete?.id)
      throw new Error(`athlete upsert failed for ${opts.email}: ${aErr?.message}`)
    return { profileId, athleteId: athlete.id }
  }

  async function addTeamMember(teamId: string, athleteId: string, lineupSlot: number) {
    const { error } = await supabase
      .from('team_members')
      .upsert(
        { team_id: teamId, athlete_id: athleteId, lineup_slot: lineupSlot },
        { onConflict: 'team_id,athlete_id' },
      )
    if (error) throw new Error(`team_members upsert failed: ${error.message}`)
  }

  async function ensureTeam(name: string): Promise<string> {
    const { data: existing } = await supabase
      .from('teams')
      .select('id')
      .eq('name', name)
      .eq('season_id', seasonId)
      .maybeSingle()
    if (existing?.id) return existing.id
    const { data: created, error } = await supabase
      .from('teams')
      .insert({ name, sport: SPORT, season_id: seasonId })
      .select('id')
      .single()
    if (error || !created?.id) throw new Error(`team insert failed (${name}): ${error?.message}`)
    return created.id
  }

  const EVENT_NAME = 'NU Dasmariñas Basketball Cup'

  async function ensureEvent(): Promise<string> {
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('name', EVENT_NAME)
      .eq('season_id', seasonId)
      .maybeSingle()
    if (existing?.id) {
      await supabase.from('events').update({ status: 'completed' }).eq('id', existing.id)
      return existing.id
    }
    const { data: created, error } = await supabase
      .from('events')
      .insert({
        name: EVENT_NAME,
        sport: SPORT,
        season_id: seasonId,
        format: 'single_elim',
        status: 'completed',
        category: "Men's Open",
        created_by: adminId,
      })
      .select('id')
      .single()
    if (error || !created?.id) throw new Error(`event insert failed: ${error?.message}`)
    return created.id
  }

  async function registerParticipants(eventId: string, teamIds: string[]) {
    for (let i = 0; i < teamIds.length; i++) {
      const { error } = await supabase
        .from('event_participants')
        .upsert(
          { event_id: eventId, participant_id: teamIds[i], participant_type: 'team', seed: i + 1 },
          { onConflict: 'event_id,participant_id' },
        )
      if (error) throw new Error(`event_participants upsert failed: ${error.message}`)
    }
  }

  async function ensureBracket(
    eventId: string,
    round: number,
    matchOrder: number,
    aId: string,
    bId: string,
    winnerId: string,
  ): Promise<string> {
    const { data: existing } = await supabase
      .from('brackets')
      .select('id')
      .eq('event_id', eventId)
      .eq('round', round)
      .eq('match_order', matchOrder)
      .maybeSingle()
    if (existing?.id) {
      await supabase
        .from('brackets')
        .update({ participant_a_id: aId, participant_b_id: bId, winner_id: winnerId })
        .eq('id', existing.id)
      return existing.id
    }
    const { data: created, error } = await supabase
      .from('brackets')
      .insert({
        event_id: eventId,
        round,
        match_order: matchOrder,
        participant_a_id: aId,
        participant_b_id: bId,
        winner_id: winnerId,
        bracket_type: 'winners',
        is_bye: false,
      })
      .select('id')
      .single()
    if (error || !created?.id) throw new Error(`bracket insert failed: ${error?.message}`)
    return created.id
  }

  async function ensureMatch(
    eventId: string,
    bracketId: string,
    aId: string,
    bId: string,
  ): Promise<string> {
    const { data: existing } = await supabase
      .from('matches')
      .select('id')
      .eq('bracket_id', bracketId)
      .maybeSingle()
    if (existing?.id) {
      await supabase
        .from('matches')
        .update({ status: 'completed', finalized_at: new Date().toISOString() })
        .eq('id', existing.id)
      return existing.id
    }
    const { data: created, error } = await supabase
      .from('matches')
      .insert({
        event_id: eventId,
        bracket_id: bracketId,
        participant_a_id: aId,
        participant_b_id: bId,
        status: 'completed',
        venue: 'NU Dasmariñas Gymnasium',
        scored_by: adminId,
        finalized_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error || !created?.id) throw new Error(`match insert failed: ${error?.message}`)
    return created.id
  }

  async function upsertMatchScore(
    matchId: string,
    participantId: string,
    fields: Record<string, number>,
  ) {
    const { error } = await supabase
      .from('match_scores')
      .upsert(
        { match_id: matchId, participant_id: participantId, sport: SPORT, ...fields },
        { onConflict: 'match_id,participant_id' },
      )
    if (error) throw new Error(`match_scores upsert failed: ${error.message}`)
  }

  async function setPlayerStats(
    matchId: string,
    athleteId: string,
    stats: Record<string, number>,
  ) {
    const { error } = await supabase
      .from('player_game_stats')
      .upsert(
        { match_id: matchId, athlete_id: athleteId, sport: SPORT, stats },
        { onConflict: 'match_id,athlete_id' },
      )
    if (error) throw new Error(`player_game_stats upsert failed: ${error.message}`)
  }

  // ---- Build 4 rostered teams ----
  type Roster = { athleteId: string; name: string }[]
  const teamIds: string[] = []
  const rosters: Roster[] = []

  for (let t = 0; t < TEAMS.length; t++) {
    const { name, department } = TEAMS[t]
    const teamId = await ensureTeam(name)
    teamIds.push(teamId)
    const roster: Roster = []
    const slug = name.toLowerCase().replace(/\s+/g, '-')
    for (let i = 0; i < 6; i++) {
      const idx = t * 6 + i
      const fullName = nameFor(idx)
      const email = `${slug}-${String(i + 1).padStart(2, '0')}@${EMAIL_DOMAIN}`
      const studentId = `2023-${(100000 + idx * 137).toString().slice(0, 6)}`
      const { athleteId } = await ensureAthlete({
        email,
        fullName,
        studentId,
        department,
        position: POSITIONS[i % POSITIONS.length],
        jerseyNumber: i + 1,
      })
      await addTeamMember(teamId, athleteId, i + 1)
      roster.push({ athleteId, name: fullName })
    }
    rosters.push(roster)
    console.log(`Team ready: ${name} (${roster.length} players)`)
  }

  const [blazers, titans, warriors, eagles] = teamIds
  const [blazersRoster, titansRoster, warriorsRoster, eaglesRoster] = rosters

  const eventId = await ensureEvent()
  await registerParticipants(eventId, teamIds)

  async function playMatch(
    round: number,
    order: number,
    aId: string,
    aRoster: Roster,
    aScore: [number, number, number, number],
    bId: string,
    bRoster: Roster,
    bScore: [number, number, number, number],
  ) {
    const aTotal = aScore.reduce((s, v) => s + v, 0)
    const bTotal = bScore.reduce((s, v) => s + v, 0)
    const winnerId = aTotal > bTotal ? aId : bId
    const bracketId = await ensureBracket(eventId, round, order, aId, bId, winnerId)
    const matchId = await ensureMatch(eventId, bracketId, aId, bId)

    await upsertMatchScore(matchId, aId, { q1: aScore[0], q2: aScore[1], q3: aScore[2], q4: aScore[3] })
    await upsertMatchScore(matchId, bId, { q1: bScore[0], q2: bScore[1], q3: bScore[2], q4: bScore[3] })

    // Two starters per side get a real box score line; the rest stay at 0
    // (bench minutes), same realism level as seedShowcaseData.ts.
    const perSide = (roster: Roster, total: number) => [
      { pts: Math.round(total * 0.32), reb: 7, ast: 5, stl: 2, blk: 1, fgm: 9, fga: 18, tpm: 2, tpa: 6, ftm: 4, fta: 5, pf: 2 },
      { pts: Math.round(total * 0.22), reb: 9, ast: 2, stl: 1, blk: 2, fgm: 6, fga: 13, tpm: 0, tpa: 1, ftm: 2, fta: 3, pf: 3 },
    ].map((line, i) => ({ roster: roster[i], line }))

    for (const { roster: r, line } of [...perSide(aRoster, aTotal), ...perSide(bRoster, bTotal)]) {
      await setPlayerStats(matchId, r.athleteId, {
        total_points: line.pts,
        total_rebounds: line.reb,
        total_assists: line.ast,
        total_steals: line.stl,
        total_blocks: line.blk,
        fg_made: line.fgm,
        fg_attempted: line.fga,
        three_made: line.tpm,
        three_attempted: line.tpa,
        ft_made: line.ftm,
        ft_attempted: line.fta,
        fouls: line.pf,
        turnovers: 2,
      })
    }

    for (const p of [...aRoster.slice(0, 2), ...bRoster.slice(0, 2)]) {
      const { error } = await supabase.rpc('recompute_player_season_stats', {
        p_athlete_id: p.athleteId,
        p_season_id: seasonId,
      })
      if (error) console.warn(`  recompute_player_season_stats warning (${p.name}): ${error.message}`)
    }

    console.log(
      `Round ${round} #${order}: ${aTotal} - ${bTotal} (winner: ${winnerId === aId ? 'A' : 'B'})`,
    )
    return { matchId, winnerId }
  }

  console.log(`\n=== ${EVENT_NAME} ===`)

  // Semifinal 1: Blazers def. Titans
  await playMatch(1, 1, blazers, blazersRoster, [22, 18, 20, 19], titans, titansRoster, [18, 20, 17, 16])
  // Semifinal 2: Warriors def. Eagles
  await playMatch(1, 2, warriors, warriorsRoster, [20, 19, 24, 21], eagles, eaglesRoster, [17, 18, 19, 20])
  // Final: Blazers def. Warriors — gives Blazers a 2-game win streak, Warriors a mixed 1-1
  await playMatch(2, 1, blazers, blazersRoster, [21, 20, 19, 18], warriors, warriorsRoster, [19, 17, 20, 16])

  for (const teamId of teamIds) {
    const { error } = await supabase.rpc('recompute_team_season_stats', {
      p_team_id: teamId,
      p_season_id: seasonId,
    })
    if (error) console.warn(`  recompute_team_season_stats warning: ${error.message}`)
  }

  try {
    const { data: matches } = await supabase
      .from('matches')
      .select('id')
      .eq('event_id', eventId)
    const { computeInsightsForMatch } = await import('../services/computeInsights')
    for (const m of matches ?? []) {
      await computeInsightsForMatch(m.id as string, seasonId)
    }
  } catch (e) {
    console.warn('  computeInsightsForMatch warning:', e instanceof Error ? e.message : e)
  }

  console.log('\n=== Done ===')
  console.log(`Champion: SBMA Blazers (2-0)  ·  Runner-up: SASE Warriors (1-1)`)
  console.log(`3rd place (tied, eliminated round 1): SECA Titans, SHS Eagles (0-1 each)`)
  console.log(`Demo athlete password (all seeded accounts): ${DEMO_PASSWORD}`)
  console.log(`Sample login: sbma-blazers-01@${EMAIL_DOMAIN} / ${DEMO_PASSWORD}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
