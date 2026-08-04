/**
 * Showcase data for manually verifying the mobile/web clients end-to-end:
 * two rostered teams per sport, plus a past (completed), live (in_progress),
 * and upcoming (registration) event each — so every major view has something
 * real to show: live scoring, team rosters, standings, insights, and the
 * guest hub's upcoming/past event tabs.
 *
 * Run from repo root: pnpm --filter server seed:showcase
 * Requires apps/server/.env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Re-running is safe — teams/events/athletes are looked up by name/email
 * first, so it won't create duplicates, just refreshes scores/stats.
 */

import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const DEMO_PASSWORD = 'Showcase123!'
const EMAIL_DOMAIN = 'students.nu-dasma.edu.ph' // matches the mobile app's hardcoded fallback

type SportKey = 'basketball' | 'volleyball' | 'table-tennis'

const FIRST_NAMES = [
  'Miguel',
  'Josef',
  'Andre',
  'Carlo',
  'Diego',
  'Marco',
  'Rafael',
  'Gabriel',
  'Nathan',
  'Lucas',
  'Ethan',
  'Xavier',
  'Julian',
  'Adrian',
  'Sean',
  'Kyle',
  'Vince',
  'Aaron',
  'Elijah',
  'Renz',
  'Paolo',
  'Gian',
  'Mikko',
  'Jarrell',
  'Enzo',
  'Bryce',
  'Cole',
  'Trent',
]
const LAST_NAMES = [
  'Santos',
  'Reyes',
  'Cruz',
  'Bautista',
  'Gonzales',
  'Ramos',
  'Mendoza',
  'Torres',
  'Flores',
  'Rivera',
  'Villanueva',
  'Aquino',
  'Del Rosario',
  'Salazar',
  'Castillo',
  'Navarro',
  'Domingo',
  'Pascual',
  'Fernandez',
  'Garcia',
]

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
    console.error(
      'No active season found. Run migrations (054 seeds a default) or create/activate one first.',
    )
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
    sport: SportKey
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
          sport: opts.sport,
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

  async function addTeamMember(teamId: string, athleteId: string, lineupSlot?: number) {
    const { error } = await supabase
      .from('team_members')
      .upsert(
        {
          team_id: teamId,
          athlete_id: athleteId,
          ...(lineupSlot != null ? { lineup_slot: lineupSlot } : {}),
        },
        { onConflict: 'team_id,athlete_id' },
      )
    if (error) throw new Error(`team_members upsert failed: ${error.message}`)
  }

  async function ensureTeam(name: string, sport: SportKey): Promise<string> {
    const { data: existing } = await supabase
      .from('teams')
      .select('id')
      .eq('name', name)
      .eq('season_id', seasonId)
      .maybeSingle()
    if (existing?.id) return existing.id
    const { data: created, error } = await supabase
      .from('teams')
      .insert({ name, sport, season_id: seasonId })
      .select('id')
      .single()
    if (error || !created?.id) throw new Error(`team insert failed (${name}): ${error?.message}`)
    return created.id
  }

  async function ensureEvent(name: string, sport: SportKey, status: string): Promise<string> {
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('name', name)
      .eq('season_id', seasonId)
      .maybeSingle()
    if (existing?.id) {
      await supabase.from('events').update({ status }).eq('id', existing.id)
      return existing.id
    }
    const { data: created, error } = await supabase
      .from('events')
      .insert({
        name,
        sport,
        season_id: seasonId,
        format: 'single_elim',
        status,
        created_by: adminId,
      })
      .select('id')
      .single()
    if (error || !created?.id) throw new Error(`event insert failed (${name}): ${error?.message}`)
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

  async function ensureBracketFinal(
    eventId: string,
    aId: string,
    bId: string,
    winnerId: string,
  ): Promise<string> {
    const { data: existing } = await supabase
      .from('brackets')
      .select('id')
      .eq('event_id', eventId)
      .eq('round', 1)
      .eq('match_order', 1)
      .maybeSingle()
    if (existing?.id) {
      await supabase.from('brackets').update({ winner_id: winnerId }).eq('id', existing.id)
      return existing.id
    }
    const { data: created, error } = await supabase
      .from('brackets')
      .insert({
        event_id: eventId,
        round: 1,
        match_order: 1,
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
    aId: string,
    bId: string,
    status: string,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const { data: existing } = await supabase
      .from('matches')
      .select('id')
      .eq('event_id', eventId)
      .eq('participant_a_id', aId)
      .eq('participant_b_id', bId)
      .maybeSingle()
    if (existing?.id) {
      await supabase
        .from('matches')
        .update({ status, ...extra })
        .eq('id', existing.id)
      return existing.id
    }
    const { data: created, error } = await supabase
      .from('matches')
      .insert({
        event_id: eventId,
        participant_a_id: aId,
        participant_b_id: bId,
        status,
        venue: 'NU Gym 1',
        scored_by: adminId,
        ...extra,
      })
      .select('id')
      .single()
    if (error || !created?.id) throw new Error(`match insert failed: ${error?.message}`)
    return created.id
  }

  async function upsertMatchScore(
    matchId: string,
    participantId: string,
    sport: SportKey,
    fields: Record<string, number>,
  ) {
    const { error } = await supabase
      .from('match_scores')
      .upsert(
        { match_id: matchId, participant_id: participantId, sport, ...fields },
        { onConflict: 'match_id,participant_id' },
      )
    if (error) throw new Error(`match_scores upsert failed: ${error.message}`)
  }

  async function addScoringAction(
    matchId: string,
    athleteId: string | null,
    participantId: string,
    sport: SportKey,
    actionType: string,
    value: number,
    period: number,
    scoreAfter: Record<string, number>,
  ) {
    const { error } = await supabase.from('scoring_actions').insert({
      match_id: matchId,
      athlete_id: athleteId,
      participant_id: participantId,
      sport,
      action_type: actionType,
      value,
      quarter_or_set: period,
      recorded_by: adminId,
      score_after: scoreAfter,
    })
    if (error) throw new Error(`scoring_actions insert failed: ${error.message}`)
  }

  type RosterEntry = { athleteId: string; name: string }

  async function buildSport(opts: {
    sportKey: SportKey
    sportLabel: string
    teamNames: [string, string]
    rosterSize: number
    positions: string[]
    department: string
  }) {
    const { sportKey, sportLabel, teamNames, rosterSize, positions, department } = opts
    console.log(`\n=== ${sportLabel} ===`)

    const teamAId = await ensureTeam(teamNames[0], sportKey)
    const teamBId = await ensureTeam(teamNames[1], sportKey)
    console.log(`Teams: ${teamNames[0]} / ${teamNames[1]}`)

    const rosters: { A: RosterEntry[]; B: RosterEntry[] } = { A: [], B: [] }
    const shortSport = sportKey === 'table-tennis' ? 'tt' : sportKey.slice(0, 2)

    for (const label of ['A', 'B'] as const) {
      const teamId = label === 'A' ? teamAId : teamBId
      for (let i = 0; i < rosterSize; i++) {
        const idx = label === 'A' ? i : i + rosterSize
        const fullName = nameFor(idx)
        const slug = `${shortSport}-${label.toLowerCase()}-${String(i + 1).padStart(2, '0')}`
        const email = `showcase-${slug}@${EMAIL_DOMAIN}`
        const studentId = `2026-SHOWCASE-${shortSport.toUpperCase()}-${label}${String(i + 1).padStart(2, '0')}`
        const position = positions.length ? positions[i % positions.length] : ''
        const { athleteId } = await ensureAthlete({
          email,
          fullName,
          studentId,
          sport: sportKey,
          department,
          position,
          jerseyNumber: i + 1,
        })
        await addTeamMember(teamId, athleteId, i + 1)
        rosters[label].push({ athleteId, name: fullName })
      }
    }
    console.log(
      `Rostered ${rosterSize} players per team (login: showcase-${shortSport}-a-01@${EMAIL_DOMAIN} / ${DEMO_PASSWORD})`,
    )

    // ---- 1. Past (completed) event ----
    const pastEventId = await ensureEvent(
      `[Showcase] ${sportLabel} — Preseason Classic`,
      sportKey,
      'completed',
    )
    await registerParticipants(pastEventId, [teamAId, teamBId])
    const pastBracketId = await ensureBracketFinal(pastEventId, teamAId, teamBId, teamAId)
    // recompute_team_season_stats derives W/L via matches.bracket_id -> brackets.winner_id,
    // so the match must actually reference the bracket row, not just share an event.
    const pastMatchId = await ensureMatch(pastEventId, teamAId, teamBId, 'completed', {
      finalized_at: new Date().toISOString(),
      bracket_id: pastBracketId,
    })

    if (sportKey === 'basketball') {
      await upsertMatchScore(pastMatchId, teamAId, sportKey, { q1: 22, q2: 18, q3: 20, q4: 19 })
      await upsertMatchScore(pastMatchId, teamBId, sportKey, { q1: 18, q2: 20, q3: 17, q4: 21 })
      await supabase.from('player_game_stats').upsert(
        [
          {
            match_id: pastMatchId,
            athlete_id: rosters.A[0].athleteId,
            sport: sportKey,
            stats: {
              total_points: 24,
              total_rebounds: 6,
              total_assists: 5,
              total_steals: 2,
              total_blocks: 0,
              fg_made: 9,
              fg_attempted: 17,
              three_made: 2,
              three_attempted: 5,
              ft_made: 4,
              ft_attempted: 5,
              fouls: 2,
            },
          },
          {
            match_id: pastMatchId,
            athlete_id: rosters.A[1].athleteId,
            sport: sportKey,
            stats: {
              total_points: 16,
              total_rebounds: 9,
              total_assists: 2,
              total_steals: 1,
              total_blocks: 3,
              fg_made: 7,
              fg_attempted: 12,
              three_made: 0,
              three_attempted: 1,
              ft_made: 2,
              ft_attempted: 3,
              fouls: 3,
            },
          },
          {
            match_id: pastMatchId,
            athlete_id: rosters.B[0].athleteId,
            sport: sportKey,
            stats: {
              total_points: 21,
              total_rebounds: 4,
              total_assists: 6,
              total_steals: 3,
              total_blocks: 0,
              fg_made: 8,
              fg_attempted: 16,
              three_made: 1,
              three_attempted: 4,
              ft_made: 4,
              ft_attempted: 4,
              fouls: 1,
            },
          },
          {
            match_id: pastMatchId,
            athlete_id: rosters.B[1].athleteId,
            sport: sportKey,
            stats: {
              total_points: 14,
              total_rebounds: 8,
              total_assists: 1,
              total_steals: 0,
              total_blocks: 2,
              fg_made: 6,
              fg_attempted: 11,
              three_made: 0,
              three_attempted: 0,
              ft_made: 2,
              ft_attempted: 2,
              fouls: 4,
            },
          },
        ],
        { onConflict: 'match_id,athlete_id' },
      )
    } else if (sportKey === 'volleyball') {
      await upsertMatchScore(pastMatchId, teamAId, sportKey, {
        set1: 25,
        set2: 25,
        set3: 25,
        sets_won: 3,
      })
      await upsertMatchScore(pastMatchId, teamBId, sportKey, {
        set1: 20,
        set2: 22,
        set3: 18,
        sets_won: 0,
      })
      await supabase.from('player_game_stats').upsert(
        [
          {
            match_id: pastMatchId,
            athlete_id: rosters.A[0].athleteId,
            sport: sportKey,
            stats: {
              kills: 14,
              aces: 3,
              digs: 5,
              blocks: 2,
              assists: 1,
              errors: 2,
              serve_errors: 1,
              attacks: 22,
            },
          },
          {
            match_id: pastMatchId,
            athlete_id: rosters.A[1].athleteId,
            sport: sportKey,
            stats: {
              kills: 2,
              aces: 1,
              digs: 10,
              blocks: 0,
              assists: 18,
              errors: 1,
              serve_errors: 0,
              attacks: 3,
            },
          },
          {
            match_id: pastMatchId,
            athlete_id: rosters.B[0].athleteId,
            sport: sportKey,
            stats: {
              kills: 9,
              aces: 1,
              digs: 6,
              blocks: 3,
              assists: 2,
              errors: 4,
              serve_errors: 2,
              attacks: 19,
            },
          },
          {
            match_id: pastMatchId,
            athlete_id: rosters.B[1].athleteId,
            sport: sportKey,
            stats: {
              kills: 1,
              aces: 0,
              digs: 8,
              blocks: 1,
              assists: 15,
              errors: 2,
              serve_errors: 1,
              attacks: 2,
            },
          },
        ],
        { onConflict: 'match_id,athlete_id' },
      )
    } else {
      await upsertMatchScore(pastMatchId, teamAId, sportKey, {
        game1: 11,
        game2: 9,
        game3: 11,
        game4: 11,
        games_won: 3,
      })
      await upsertMatchScore(pastMatchId, teamBId, sportKey, {
        game1: 8,
        game2: 11,
        game3: 7,
        game4: 6,
        games_won: 1,
      })
      await supabase.from('player_game_stats').upsert(
        [
          {
            match_id: pastMatchId,
            athlete_id: rosters.A[0].athleteId,
            sport: sportKey,
            stats: { mw: 1, sets_won: 3, sets_lost: 1, pts_scored: 42, pts_conceded: 32, aces: 4 },
          },
          {
            match_id: pastMatchId,
            athlete_id: rosters.B[0].athleteId,
            sport: sportKey,
            stats: { mw: 0, sets_won: 1, sets_lost: 3, pts_scored: 32, pts_conceded: 42, aces: 2 },
          },
        ],
        { onConflict: 'match_id,athlete_id' },
      )
    }

    for (const p of [
      ...rosters.A.slice(0, 2),
      ...rosters.B.slice(0, sportKey === 'table-tennis' ? 1 : 2),
    ]) {
      const { error } = await supabase.rpc('recompute_player_season_stats', {
        p_athlete_id: p.athleteId,
        p_season_id: seasonId,
      })
      if (error)
        console.warn(`  recompute_player_season_stats warning (${p.name}): ${error.message}`)
    }
    for (const teamId of [teamAId, teamBId]) {
      const { error } = await supabase.rpc('recompute_team_season_stats', {
        p_team_id: teamId,
        p_season_id: seasonId,
      })
      if (error) console.warn(`  recompute_team_season_stats warning: ${error.message}`)
    }
    try {
      const { computeInsightsForMatch } = await import('../services/computeInsights')
      await computeInsightsForMatch(pastMatchId, seasonId)
    } catch (e) {
      console.warn('  computeInsightsForMatch warning:', e instanceof Error ? e.message : e)
    }
    console.log(`Past event ready: completed ${teamNames[0]} def. ${teamNames[1]}`)

    // ---- 2. Live event (the main point of this seed) ----
    const liveEventId = await ensureEvent(
      `[Showcase] ${sportLabel} — Midseason Invitational`,
      sportKey,
      'in_progress',
    )
    await registerParticipants(liveEventId, [teamAId, teamBId])
    const liveMatchId = await ensureMatch(liveEventId, teamAId, teamBId, 'live', {
      current_period: 3,
    })

    if (sportKey === 'basketball') {
      await upsertMatchScore(liveMatchId, teamAId, sportKey, { q1: 24, q2: 21, q3: 8 })
      await upsertMatchScore(liveMatchId, teamBId, sportKey, { q1: 20, q2: 19, q3: 6 })
      await addScoringAction(
        liveMatchId,
        rosters.A[0].athleteId,
        teamAId,
        sportKey,
        'two_pointer',
        2,
        3,
        { a: 53, b: 45 },
      )
      await addScoringAction(
        liveMatchId,
        rosters.B[0].athleteId,
        teamBId,
        sportKey,
        'three_pointer',
        3,
        3,
        { a: 53, b: 45 },
      )
    } else if (sportKey === 'volleyball') {
      await upsertMatchScore(liveMatchId, teamAId, sportKey, {
        set1: 25,
        set2: 19,
        set3: 10,
        sets_won: 1,
      })
      await upsertMatchScore(liveMatchId, teamBId, sportKey, {
        set1: 21,
        set2: 25,
        set3: 8,
        sets_won: 1,
      })
      await addScoringAction(liveMatchId, rosters.A[0].athleteId, teamAId, sportKey, 'kill', 1, 3, {
        a: 10,
        b: 8,
      })
      await addScoringAction(liveMatchId, rosters.B[0].athleteId, teamBId, sportKey, 'ace', 1, 3, {
        a: 10,
        b: 8,
      })
    } else {
      await upsertMatchScore(liveMatchId, teamAId, sportKey, {
        game1: 11,
        game2: 9,
        game3: 6,
        games_won: 1,
      })
      await upsertMatchScore(liveMatchId, teamBId, sportKey, {
        game1: 7,
        game2: 11,
        game3: 5,
        games_won: 1,
      })
      await addScoringAction(
        liveMatchId,
        rosters.A[0].athleteId,
        teamAId,
        sportKey,
        'point',
        1,
        3,
        { a: 6, b: 5 },
      )
      await addScoringAction(
        liveMatchId,
        rosters.B[0].athleteId,
        teamBId,
        sportKey,
        'point',
        1,
        3,
        { a: 6, b: 5 },
      )
    }
    console.log(`LIVE match ready: ${liveMatchId}  →  jumbotron: /jumbotron/${liveMatchId}`)

    // ---- 3. Upcoming (registration) event ----
    const upcomingEventId = await ensureEvent(
      `[Showcase] ${sportLabel} — Season Finals`,
      sportKey,
      'registration',
    )
    await registerParticipants(upcomingEventId, [teamAId, teamBId])
    const scheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    await ensureMatch(upcomingEventId, teamAId, teamBId, 'scheduled', { scheduled_at: scheduledAt })
    console.log(`Upcoming event ready: scheduled for ${scheduledAt}`)

    return { teamAId, teamBId, pastEventId, liveEventId, upcomingEventId, liveMatchId }
  }

  const results: Record<string, unknown> = {}
  results.basketball = await buildSport({
    sportKey: 'basketball',
    sportLabel: 'Basketball',
    teamNames: ['[Showcase] Thunder Hawks', '[Showcase] Iron Wolves'],
    rosterSize: 6,
    positions: ['PG', 'SG', 'SF', 'PF', 'C'],
    department: 'SBMA',
  })
  results.volleyball = await buildSport({
    sportKey: 'volleyball',
    sportLabel: 'Volleyball',
    teamNames: ['[Showcase] Coastal Spikers', '[Showcase] Summit Blockers'],
    rosterSize: 7,
    positions: ['S', 'L', 'OH', 'OPP', 'MB', 'DS'],
    department: 'SECA',
  })
  results['table-tennis'] = await buildSport({
    sportKey: 'table-tennis',
    sportLabel: 'Table Tennis',
    teamNames: ['[Showcase] Paddle Kings', '[Showcase] Spin Masters'],
    rosterSize: 4,
    positions: [],
    department: 'SASE',
  })

  console.log('\n=== Done ===')
  console.log(`Demo athlete password (all seeded accounts): ${DEMO_PASSWORD}`)
  console.log(
    'Sample logins (team A, player 1 — see per-sport logs above for the exact prefix used):',
  )
  console.log(`  showcase-ba-a-01@${EMAIL_DOMAIN}  (basketball)`)
  console.log(`  showcase-vo-a-01@${EMAIL_DOMAIN}  (volleyball)`)
  console.log(`  showcase-tt-a-01@${EMAIL_DOMAIN}  (table tennis)`)
  console.log(JSON.stringify(results, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
