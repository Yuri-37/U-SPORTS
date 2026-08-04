/**
 * Demo data for automated insights (player trending).
 *
 * What this does
 * 1. Finds a basketball event in the active season (two participants).
 * 2. Resolves one basketball athlete (by `--email`, `--athlete-id`, or first `athletes.sport = basketball`).
 * 3. Inserts 4 completed matches on that event + `player_game_stats` with staggered `created_at`:
 *    Games 1–3: 5 pts each (baseline). Game 4: 25 pts (spike).
 *    Season avg points after 4 games: 40/4 = 10. Last-3 avg: (5+5+25)/3 ≈ 11.67 → ~17% vs baseline → triggers trending insight on `total_points`.
 * 4. Calls `recompute_player_season_stats` once for that athlete/season.
 * 5. Runs the same insight logic as production (`computeInsightsForMatch` in the API server — no Edge Function).
 *
 * Run from repo root (`pnpm seed:insights-demo`) or from `apps/server` (`pnpm seed:insights-demo`).
 * Pass-through args after `--` (use a real athlete email or id from your DB — not placeholders like your@email.com):
 *   pnpm seed:insights-demo -- --email=someone-real@your-school.edu
 * Or pass --athlete-id=<uuid>: normally athletes.id; if you paste profiles.id by mistake, the script resolves via athletes.profile_id when possible.
 * Omit both to pick the first `athletes` row with sport basketball.
 *
 * `--demo-player` — creates (or reuses) a dedicated demo Auth user + athlete (`insights-demo-athlete@u-sports.local`,
 * student id `insights-demo-athlete-001`) so you do not need an existing player. Overrides `--email` / `--athlete-id`.
 * Optional env: `SEED_INSIGHTS_DEMO_EMAIL`, `SEED_INSIGHTS_DEMO_FULL_NAME`, `SEED_INSIGHTS_DEMO_STUDENT_ID`.
 *
 * Optional: SEED_SKIP_COMPUTE_INSIGHTS=true — only insert matches/stats, skip insight writes.
 *
 * Requires in apps/server/.env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Note: Each run adds new rows (matches + stats). Delete demo rows in Supabase if you need a clean slate.
 */

import path from 'path'
import crypto from 'crypto'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

function arg(name: string): string | undefined {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : undefined
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Docs/examples only — not real accounts. */
const DOC_PLACEHOLDER_EMAILS = new Set(
  ['your@email.com', 'you@example.com', 'user@example.com', 'test@example.com'].map((e) =>
    e.toLowerCase(),
  ),
)

/** Validates `--athlete-id` — rejects tutorial placeholders like `<uuid>`. */
function parseAthleteIdArg(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const s = raw.trim()
  if (!s) return undefined
  const lower = s.toLowerCase()
  if (lower === '<uuid>' || s.includes('<') || s.includes('>')) {
    console.error(
      [
        'Invalid --athlete-id: you used a placeholder.',
        'Use a real UUID from Supabase → athletes (copy the id column).',
        'Example: --athlete-id=81961f53-3214-4ac2-a808-460f04618255',
      ].join('\n'),
    )
    process.exit(1)
  }
  if (!UUID_RE.test(s)) {
    console.error(`Invalid --athlete-id (not a UUID): ${s}`)
    process.exit(1)
  }
  return s
}

function bbGameStats(totalPoints: number): Record<string, number> {
  return {
    total_points: totalPoints,
    total_rebounds: 2,
    total_assists: 1,
    fg_made: Math.max(1, Math.round(totalPoints / 2)),
  }
}

/** Ensure a season, two basketball teams, and a basketball event with two participants exist. Returns ids. */
async function ensureDemoPrerequisites(supabase: SupabaseClient): Promise<{
  seasonId: string
  seasonName: string
  eventId: string
  participantA: string
  participantB: string
}> {
  let { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!season?.id) {
    const { data: created, error } = await supabase
      .from('seasons')
      .insert({
        name: 'Demo Season',
        status: 'active',
        start_date: new Date().toISOString().slice(0, 10),
      })
      .select('id, name')
      .single()
    if (error || !created?.id) {
      console.error('Failed to create demo season:', error?.message)
      process.exit(1)
    }
    season = created
    console.log(`Created demo season: ${season.name} (${season.id})`)
  } else {
    console.log(`Using existing active season: ${season.name} (${season.id})`)
  }

  let { data: event } = await supabase
    .from('events')
    .select('id')
    .eq('season_id', season.id)
    .eq('sport', 'basketball')
    .limit(1)
    .maybeSingle()

  let teamA: string
  let teamB: string

  if (!event?.id) {
    const insertTeams = await supabase
      .from('teams')
      .insert([
        { name: 'Demo Team Alpha', sport: 'basketball', season_id: season.id },
        { name: 'Demo Team Beta', sport: 'basketball', season_id: season.id },
      ])
      .select('id')

    if (insertTeams.error || !insertTeams.data || insertTeams.data.length < 2) {
      console.error('Failed to create demo teams:', insertTeams.error?.message)
      process.exit(1)
    }
    teamA = insertTeams.data[0].id as string
    teamB = insertTeams.data[1].id as string
    console.log(`Created demo teams: Alpha (${teamA}), Beta (${teamB})`)

    const { data: ev, error: evErr } = await supabase
      .from('events')
      .insert({
        name: 'Demo Basketball Event',
        sport: 'basketball',
        season_id: season.id,
        format: 'single_elim',
        status: 'in_progress',
      })
      .select('id')
      .single()

    if (evErr || !ev?.id) {
      console.error('Failed to create demo event:', evErr?.message)
      process.exit(1)
    }
    event = ev
    console.log(`Created demo basketball event: ${ev.id}`)

    await supabase.from('event_participants').insert([
      { event_id: event.id, participant_id: teamA, participant_type: 'team', seed: 1 },
      { event_id: event.id, participant_id: teamB, participant_type: 'team', seed: 2 },
    ])
    console.log('Registered two teams as participants.')
  } else {
    console.log(`Using existing basketball event: ${event.id}`)
    const { data: parts } = await supabase
      .from('event_participants')
      .select('participant_id')
      .eq('event_id', event.id)
      .limit(2)
    if (!parts || parts.length < 2) {
      console.error('Existing event has fewer than 2 participants. Add two teams to it first.')
      process.exit(1)
    }
    teamA = parts[0].participant_id as string
    teamB = parts[1].participant_id as string
  }

  return {
    seasonId: season.id,
    seasonName: season.name,
    eventId: event!.id,
    participantA: teamA,
    participantB: teamB,
  }
}

/** Stable demo identity for insights seed — satisfies athletes FK via auth.users → profiles. */
async function ensureInsightsDemoAthlete(
  supabase: SupabaseClient,
): Promise<{ id: string; sport: string; profile_id: string }> {
  const demoEmail =
    process.env.SEED_INSIGHTS_DEMO_EMAIL?.trim() || 'insights-demo-athlete@u-sports.local'
  const demoName = process.env.SEED_INSIGHTS_DEMO_FULL_NAME?.trim() || 'Insights Demo Athlete'
  const demoStudentId =
    process.env.SEED_INSIGHTS_DEMO_STUDENT_ID?.trim() || 'insights-demo-athlete-001'

  const { data: byStudent } = await supabase
    .from('athletes')
    .select('id, sport, profile_id')
    .eq('student_id', demoStudentId)
    .maybeSingle()

  if (byStudent?.id && byStudent.profile_id) {
    console.log(`Using existing demo athlete (${demoStudentId}): ${byStudent.id}`)
    return { id: byStudent.id, sport: byStudent.sport, profile_id: byStudent.profile_id }
  }

  let profileId: string | undefined

  const { data: profByEmail } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', demoEmail)
    .maybeSingle()
  profileId = profByEmail?.id

  if (!profileId) {
    const password = `${crypto.randomUUID()}${crypto.randomUUID()}`
    const { data: created, error: cuErr } = await supabase.auth.admin.createUser({
      email: demoEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: demoName },
    })

    if (!cuErr && created.user?.id) {
      profileId = created.user.id
      console.log(`Created demo Auth user + profile: ${demoEmail}`)
    } else if (cuErr) {
      const msg = cuErr.message ?? ''
      const maybeExists =
        /already|registered|exists|duplicate/i.test(msg) ||
        (cuErr as { code?: string }).code === 'email_exists'
      if (maybeExists) {
        const { data: refetch } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', demoEmail)
          .maybeSingle()
        profileId = refetch?.id
      }
      if (!profileId) {
        console.error(`auth.admin.createUser failed: ${msg}`)
        process.exit(1)
      }
      console.log(`Demo email already in Auth; using profile ${profileId}`)
    }
  }

  if (!profileId) {
    console.error('Could not resolve demo profile id.')
    process.exit(1)
  }

  const { data: profOk } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', profileId)
    .maybeSingle()
  if (!profOk?.id) {
    console.error(
      'Profile row missing after Auth user creation. Check DB trigger public.handle_new_user on auth.users.',
    )
    process.exit(1)
  }

  const { data: athExisting } = await supabase
    .from('athletes')
    .select('id, sport, profile_id')
    .eq('profile_id', profileId)
    .maybeSingle()

  if (athExisting?.id) {
    console.log(`Using existing athlete linked to demo profile: ${athExisting.id}`)
    return { id: athExisting.id, sport: athExisting.sport, profile_id: athExisting.profile_id }
  }

  const { data: inserted, error: insErr } = await supabase
    .from('athletes')
    .insert({
      profile_id: profileId,
      student_id: demoStudentId,
      sport: 'basketball',
      season_status: 'active',
    })
    .select('id, sport, profile_id')
    .single()

  if (!insErr && inserted?.id) {
    console.log(`Created demo athlete: ${inserted.id} (${demoStudentId})`)
    return { id: inserted.id, sport: inserted.sport, profile_id: inserted.profile_id }
  }

  if (insErr?.code === '23505' || /duplicate key.*student_id/i.test(insErr?.message ?? '')) {
    const { data: again } = await supabase
      .from('athletes')
      .select('id, sport, profile_id')
      .eq('student_id', demoStudentId)
      .maybeSingle()
    if (again?.id) {
      console.log(`Race: demo athlete already exists (${demoStudentId}): ${again.id}`)
      return { id: again.id, sport: again.sport, profile_id: again.profile_id }
    }
  }

  console.error('Failed to insert demo athlete:', insErr?.message ?? 'unknown')
  process.exit(1)
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url?.trim() || !key?.trim()) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/server/.env')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  const demoPlayer = process.argv.includes('--demo-player')
  const email = arg('email')
  const athleteIdArg = parseAthleteIdArg(arg('athlete-id'))

  if (demoPlayer && (athleteIdArg || email?.trim())) {
    console.warn('--demo-player: ignoring --athlete-id / --email (using synthetic demo athlete).')
  }

  let seasonId: string
  let seasonName: string
  let eventId: string
  let participantA: string
  let participantB: string

  if (demoPlayer) {
    const prereqs = await ensureDemoPrerequisites(supabase)
    seasonId = prereqs.seasonId
    seasonName = prereqs.seasonName
    eventId = prereqs.eventId
    participantA = prereqs.participantA
    participantB = prereqs.participantB
  } else {
    const { data: season, error: seasonErr } = await supabase
      .from('seasons')
      .select('id, name')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (seasonErr || !season?.id) {
      console.error(
        'No active season found. Create or activate a season first, or use --demo-player.',
      )
      process.exit(1)
    }
    seasonId = season.id
    seasonName = season.name

    const { data: event, error: evErr } = await supabase
      .from('events')
      .select('id')
      .eq('season_id', seasonId)
      .eq('sport', 'basketball')
      .limit(1)
      .maybeSingle()

    if (evErr || !event?.id) {
      console.error(
        'No official basketball event found. Create one with two teams, or use --demo-player.',
      )
      process.exit(1)
    }
    eventId = event.id

    const { data: parts, error: pErr } = await supabase
      .from('event_participants')
      .select('participant_id')
      .eq('event_id', eventId)
      .limit(2)

    if (pErr || !parts || parts.length < 2) {
      console.error('Event needs at least two participants (teams).')
      process.exit(1)
    }
    participantA = parts[0].participant_id as string
    participantB = parts[1].participant_id as string
  }

  let athleteId = athleteIdArg ?? ''
  let athleteRow: { id: string; sport: string; profile_id: string } | null = null

  if (demoPlayer) {
    athleteRow = await ensureInsightsDemoAthlete(supabase)
    athleteId = athleteRow.id
  }

  if (!demoPlayer && !athleteId && email?.trim()) {
    const trimmed = email.trim()
    if (DOC_PLACEHOLDER_EMAILS.has(trimmed.toLowerCase())) {
      console.error(
        [
          `Looks like a documentation placeholder email (${trimmed}), not a real user.`,
          '',
          'Fix: use an email from Supabase Auth / profiles, or omit --email to auto-pick the first basketball athlete,',
          'or pass --athlete-id=<uuid from the athletes table>.',
        ].join('\n'),
      )
      process.exit(1)
    }
    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', trimmed)
      .maybeSingle()
    if (!prof?.id) {
      console.error(
        [
          `No profile row found for email: ${trimmed}`,
          '',
          'Check spelling and Supabase → Authentication / profiles.',
          'Or omit --email to use the first basketball athlete, or use --athlete-id=<uuid>.',
        ].join('\n'),
      )
      process.exit(1)
    }
    const { data: ath } = await supabase
      .from('athletes')
      .select('id')
      .eq('profile_id', prof.id)
      .maybeSingle()
    if (!ath?.id) {
      console.error('Profile exists but is not linked to an athlete row.')
      process.exit(1)
    }
    athleteId = ath.id
  }

  if (!demoPlayer && !athleteId) {
    const { data: ath } = await supabase
      .from('athletes')
      .select('id')
      .eq('sport', 'basketball')
      .limit(1)
      .maybeSingle()
    athleteId = ath?.id ?? ''
  }

  if (!demoPlayer && !athleteId) {
    console.error(
      'Could not resolve athlete. Pass --demo-player, or --athlete-id=..., or --email=..., or seed basketball athletes.',
    )
    process.exit(1)
  }

  const { data: athleteRowById } = await supabase
    .from('athletes')
    .select('id, sport, profile_id')
    .eq('id', athleteId)
    .maybeSingle()

  if (!athleteRow && athleteRowById?.id) {
    athleteRow = athleteRowById as { id: string; sport: string; profile_id: string }
  }

  let resolvedAthleteRow = athleteRow

  if (!resolvedAthleteRow?.id && athleteIdArg && athleteId === athleteIdArg && !demoPlayer) {
    const { data: byProf, error: bpErr } = await supabase
      .from('athletes')
      .select('id, sport, profile_id')
      .eq('profile_id', athleteIdArg)
      .limit(2)

    if (!bpErr && byProf?.length === 1 && byProf[0]?.id) {
      athleteId = byProf[0].id
      resolvedAthleteRow = byProf[0] as { id: string; sport: string; profile_id: string }
      console.warn(
        `--athlete-id was not athletes.id; matched athletes.profile_id → using athletes.id ${athleteId}.`,
      )
    } else if (!bpErr && byProf && byProf.length > 1) {
      console.error('Multiple athlete rows share this profile_id; pass athletes.id explicitly.')
      process.exit(1)
    }
  }

  if (!resolvedAthleteRow?.id) {
    console.error(
      [
        `No athlete for id: ${athleteId}`,
        '',
        'Use athletes.id (primary key on athletes). Common mix-up: passing profiles.id instead.',
        'Your athletes row id should match the athlete record; profiles.id links via athletes.profile_id.',
        'Supabase → Table Editor → athletes → column "id".',
      ].join('\n'),
    )
    process.exit(1)
  }

  if (resolvedAthleteRow.sport !== 'basketball') {
    console.warn(
      `Warning: athlete sport is "${resolvedAthleteRow.sport}". Demo uses basketball stat keys (e.g. total_points); insights may not match production.`,
    )
  }

  const games: { points: number; minutesAgo: number }[] = [
    { points: 5, minutesAgo: 4 * 60 },
    { points: 5, minutesAgo: 3 * 60 },
    { points: 5, minutesAgo: 2 * 60 },
    { points: 25, minutesAgo: 0 },
  ]

  const now = Date.now()
  const matchIds: string[] = []

  for (let i = 0; i < games.length; i++) {
    const { points, minutesAgo } = games[i]
    const createdAt = new Date(now - minutesAgo * 60 * 1000).toISOString()

    const { data: matchRow, error: mErr } = await supabase
      .from('matches')
      .insert({
        event_id: eventId,
        participant_a_id: participantA,
        participant_b_id: participantB,
        status: 'completed',
        bracket_id: null,
      })
      .select('id')
      .single()

    if (mErr || !matchRow?.id) {
      console.error('Failed to insert match:', mErr?.message ?? 'unknown')
      process.exit(1)
    }

    matchIds.push(matchRow.id)

    const { error: gsErr } = await supabase.from('player_game_stats').insert({
      match_id: matchRow.id,
      athlete_id: athleteId,
      sport: 'basketball',
      stats: bbGameStats(points),
      created_at: createdAt,
    })

    if (gsErr) {
      console.error('Failed to insert player_game_stats:', gsErr.message)
      process.exit(1)
    }

    console.log(`Match ${i + 1}/${games.length} (${points} pts): ${matchRow.id} @ ${createdAt}`)
  }

  const { error: rpcErr } = await supabase.rpc('recompute_player_season_stats', {
    p_athlete_id: athleteId,
    p_season_id: seasonId,
  })

  if (rpcErr) {
    console.error('recompute_player_season_stats failed:', rpcErr.message)
    process.exit(1)
  }

  console.log('\nSeason stats recomputed for athlete', athleteId, 'season', seasonName)

  const lastMatchId = matchIds[matchIds.length - 1]
  const skipInsights =
    process.env.SEED_SKIP_COMPUTE_INSIGHTS === '1' ||
    process.env.SEED_SKIP_COMPUTE_INSIGHTS?.toLowerCase() === 'true'

  if (skipInsights) {
    console.log('\nSkipped insights (SEED_SKIP_COMPUTE_INSIGHTS). Matches and stats were inserted.')
  } else {
    const { computeInsightsForMatch } = await import('../services/computeInsights')
    try {
      await computeInsightsForMatch(lastMatchId, seasonId)
      console.log('\nInsights computed in-process (same code path as match end / finalize).')
    } catch (e) {
      console.error('computeInsightsForMatch failed:', e)
      process.exit(1)
    }
  }

  console.log('\nNext: open Organizer → Analytics → Insights for this season + Basketball.')
  console.log(
    `Or SQL: select * from insights where entity_id = '${athleteId}' order by created_at desc limit 5;`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
