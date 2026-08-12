/**
 * Wipes all competition data and reseeds a complete, realistic dataset for
 * end-to-end testing. Destructive — run deliberately.
 *
 *   pnpm --filter server reset:seed          (asks for confirmation)
 *   pnpm --filter server reset:seed -- --yes (skips it)
 *
 * PRESERVED, never touched:
 *   - institution (school branding)
 *   - seasons
 *   - every staff login (profiles with a role: Admin / Organizer / Coach) and
 *     their auth users. Deleting those would lock you out of your own app.
 *
 * DELETED: all athletes + their auth users, teams, events, brackets, matches,
 * scores, stats, insights, notifications, announcements, audit logs.
 *
 * SEEDED: 12 teams across 3 sports, 84 athletes, and 3 events per sport —
 * one completed (full results and box scores), one in progress whose matches
 * are LIVE at 0-0 so you can score them yourself, and one still in
 * registration so bracket generation can be tested from scratch.
 */

import path from 'path'
import readline from 'readline'
import { randomUUID } from 'crypto'
import dotenv from 'dotenv'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const EMAIL_DOMAIN = 'students.nu-dasma.edu.ph'
type Sport = 'basketball' | 'volleyball' | 'table-tennis'

// Matches the athlete importer's convention (apps/server/src/routes/students.ts)
// so a seeded athlete's password is predictable for testing.
const passwordFor = (studentId: string) => `UrSports-${studentId}-2026!`

// Roster sizes stay under the per-sport caps in utils/sportConfig.ts
// (basketball 15/5 active, volleyball 12/6, table tennis 8/2).
const SPORT_SETUP: Record<Sport, { squad: number; active: number; positions: string[] }> = {
  basketball: { squad: 8, active: 5, positions: ['PG', 'SG', 'SF', 'PF', 'C'] },
  volleyball: { squad: 9, active: 6, positions: ['OH', 'MB', 'S', 'OP', 'L'] },
  'table-tennis': { squad: 4, active: 2, positions: ['Singles', 'Doubles'] },
}

const TEAMS: { sport: Sport; name: string; department: string }[] = [
  { sport: 'basketball', name: 'SBMA Blazers', department: 'SBMA' },
  { sport: 'basketball', name: 'SECA Titans', department: 'SECA' },
  { sport: 'basketball', name: 'SASE Warriors', department: 'SASE' },
  { sport: 'basketball', name: 'SHS Eagles', department: 'SHS' },
  { sport: 'volleyball', name: 'SBMA Spikers', department: 'SBMA' },
  { sport: 'volleyball', name: 'SECA Aces', department: 'SECA' },
  { sport: 'volleyball', name: 'SASE Blockers', department: 'SASE' },
  { sport: 'volleyball', name: 'SHS Falcons', department: 'SHS' },
  { sport: 'table-tennis', name: 'SBMA Paddlers', department: 'SBMA' },
  { sport: 'table-tennis', name: 'SECA Smashers', department: 'SECA' },
  { sport: 'table-tennis', name: 'SASE Loopers', department: 'SASE' },
  { sport: 'table-tennis', name: 'SHS Spinners', department: 'SHS' },
]

const FIRST = [
  'Miguel', 'Josef', 'Andre', 'Carlo', 'Diego', 'Marco', 'Rafael', 'Gabriel',
  'Nathan', 'Lucas', 'Ethan', 'Xavier', 'Julian', 'Adrian', 'Sean', 'Kyle',
  'Vince', 'Aaron', 'Elijah', 'Renz', 'Paolo', 'Gian', 'Mikko', 'Jarrell',
  'Dominic', 'Enzo', 'Rowan', 'Tristan', 'Cedric', 'Iñigo', 'Lorenzo', 'Emman',
  'Patrick', 'Joaquin', 'Reymart', 'Bryan', 'Neil', 'Owen', 'Caleb', 'Matteo',
  'Francis', 'Alfonso',
]
const LAST = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Gonzales', 'Ramos', 'Mendoza',
  'Torres', 'Flores', 'Rivera', 'Villanueva', 'Aquino', 'Del Rosario',
  'Salazar', 'Castillo', 'Navarro', 'Domingo', 'Pascual', 'Fernandez', 'Garcia',
  'Manalo', 'Ocampo', 'Tolentino', 'Alvarez', 'Panganiban', 'Dizon', 'Lazaro',
  'Gutierrez', 'Sarmiento', 'Cabrera', 'Espiritu', 'Marquez',
]

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year']
// SHS (Senior High) only runs Grade 11/Grade 12 -- there is no 3rd/4th year there.
const SHS_YEAR_LEVELS = ['1st Year', '2nd Year']
const yearLevelsFor = (department: string) =>
  department === 'SHS' ? SHS_YEAR_LEVELS : YEAR_LEVELS

// Deterministic pseudo-random so re-runs produce the same believable numbers.
let seedState = 20260812
function rnd(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296
  return seedState / 4294967296
}
const between = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1))

function nameFor(i: number): string {
  return `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]}`
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (a) => {
      rl.close()
      resolve(a.trim().toUpperCase() === 'DELETE')
    })
  })
}

async function wipe(supabase: SupabaseClient) {
  // Child-first so foreign keys never block a delete.
  const order = [
    'scoring_actions',
    'player_game_stats',
    'match_period_locks',
    'match_scores',
    'insights',
    'player_season_stats',
    'team_season_stats',
    'matches',
    'brackets',
    'event_participants',
    'events',
    'team_members',
    'team_coaches',
    'teams',
    'notifications',
    'announcements',
    'push_tokens',
    'audit_logs',
    'athletes',
  ]

  // Supabase requires a filter on every delete. Most tables key off `id`, but
  // match_period_locks is a composite (match_id, period) with no id column.
  const filterColumn: Record<string, string> = { match_period_locks: 'match_id' }

  console.log('\nDeleting competition data')
  for (const table of order) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .not(filterColumn[table] ?? 'id', 'is', null)
    if (error) console.log(`  ${table.padEnd(22)} ERROR: ${error.message}`)
    else console.log(`  ${table.padEnd(22)} ${String(count ?? 0).padStart(5)} removed`)
  }

  // Athlete logins: a profile with no role. Staff (Admin/Organizer/Coach) keep
  // their accounts — deleting the Admin would lock the owner out of the app.
  const { data: staff } = await supabase.from('profiles').select('id, email, role').not('role', 'is', null)
  const keepIds = new Set((staff ?? []).map((s) => s.id as string))
  console.log(`\nKeeping ${keepIds.size} staff login(s):`)
  for (const s of staff ?? []) console.log(`  ${s.role}  ${s.email}`)

  const { data: doomed } = await supabase.from('profiles').select('id').is('role', null)
  const ids = (doomed ?? []).map((p) => p.id as string).filter((id) => !keepIds.has(id))
  console.log(`\nDeleting ${ids.length} athlete login(s)`)

  let removed = 0
  for (const id of ids) {
    await supabase.from('profiles').delete().eq('id', id)
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (!error) removed++
  }
  console.log(`  ${removed} auth users removed`)
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url?.trim() || !key?.trim()) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/server/.env')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  console.log(`\nTarget database: ${url}`)

  if (!process.argv.includes('--yes')) {
    const ok = await confirm(
      '\nThis DELETES all athletes, teams, events, matches and stats.\nType DELETE to continue: ',
    )
    if (!ok) {
      console.log('Aborted — nothing was changed.')
      process.exit(0)
    }
  }

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (!season?.id) {
    console.error('No active season. Create and activate one before seeding.')
    process.exit(1)
  }
  const seasonId = season.id as string
  console.log(`Season: ${season.name}`)

  const { data: admin } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'Admin')
    .limit(1)
    .maybeSingle()
  const adminId = (admin?.id as string) ?? null

  await wipe(supabase)

  // ── Athletes + teams ────────────────────────────────────────────────────
  console.log('\nCreating teams and athletes')
  type Player = { athleteId: string; profileId: string; name: string; studentId: string }
  const rosters = new Map<string, Player[]>()
  const teamIdByName = new Map<string, string>()
  let athleteIdx = 0

  for (const team of TEAMS) {
    const setup = SPORT_SETUP[team.sport]
    const { data: created, error: teamErr } = await supabase
      .from('teams')
      .insert({
        name: team.name,
        sport: team.sport,
        season_id: seasonId,
        department: team.department,
      })
      .select('id')
      .single()
    if (teamErr || !created) throw new Error(`team ${team.name}: ${teamErr?.message}`)
    const teamId = created.id as string
    teamIdByName.set(team.name, teamId)

    const roster: Player[] = []
    for (let i = 0; i < setup.squad; i++) {
      const fullName = nameFor(athleteIdx)
      const studentId = `2023-${String(170000 + athleteIdx * 131).slice(0, 6)}`
      const email = `${studentId}@${EMAIL_DOMAIN}`

      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password: passwordFor(studentId),
        email_confirm: true,
        user_metadata: { full_name: fullName },
      })
      if (authErr || !authUser?.user) throw new Error(`auth ${email}: ${authErr?.message}`)
      const profileId = authUser.user.id

      await supabase.from('profiles').upsert({
        id: profileId,
        email,
        full_name: fullName,
        role: null,
        department: team.department,
      })

      // NOTE: `athletes` has no `course` column — the import template collects
      // it but the importer drops it too (see routes/students.ts).
      const { data: ath, error: athErr } = await supabase
        .from('athletes')
        .insert({
          profile_id: profileId,
          student_id: studentId,
          sport: team.sport,
          position: setup.positions[i % setup.positions.length],
          jersey_number: String(i + 1),
          year_level: (() => {
            const pool = yearLevelsFor(team.department)
            return pool[athleteIdx % pool.length]
          })(),
          department: team.department,
          season_status: 'active',
        })
        .select('id')
        .single()
      if (athErr || !ath) throw new Error(`athlete ${email}: ${athErr?.message}`)

      // First `active` players get lineup slots 1..N; the rest are bench.
      await supabase.from('team_members').insert({
        team_id: teamId,
        athlete_id: ath.id,
        lineup_slot: i < setup.active ? i + 1 : null,
      })

      roster.push({ athleteId: ath.id as string, profileId, name: fullName, studentId })
      athleteIdx++
    }
    rosters.set(team.name, roster)
    console.log(`  ${team.name.padEnd(20)} ${team.sport.padEnd(13)} ${setup.squad} players`)
  }

  // ── Stat generators ─────────────────────────────────────────────────────
  function statsFor(sport: Sport, starter: boolean): Record<string, number> {
    if (!starter) {
      // Bench players still dress but record little — realistic, and keeps the
      // box score from looking machine-filled.
      if (sport === 'basketball') {
        const pts = between(0, 6)
        return {
          total_points: pts, fg_made: Math.floor(pts / 2), fg_attempted: between(1, 5),
          three_made: 0, three_attempted: between(0, 2), ft_made: pts % 2, ft_attempted: pts % 2,
          total_rebounds: between(0, 3), off_rebounds: between(0, 1), total_assists: between(0, 2),
          total_steals: between(0, 1), total_blocks: 0, turnovers: between(0, 1), fouls: between(0, 2),
        }
      }
      if (sport === 'volleyball') {
        return {
          pts_scored: between(0, 4), kills: between(0, 3), attacks: between(1, 6), aces: between(0, 1),
          digs: between(0, 4), blocks: between(0, 1), assists: between(0, 3), errors: between(0, 2),
          serve_errors: between(0, 1), reception_errors: between(0, 1),
        }
      }
      return { pts_scored: between(0, 8), winners: between(0, 3), aces: between(0, 2), errors: between(0, 3) }
    }
    if (sport === 'basketball') {
      const fgm = between(4, 10)
      const three = between(0, 4)
      const ftm = between(1, 7)
      return {
        total_points: fgm * 2 + three + ftm,
        fg_made: fgm, fg_attempted: fgm + between(3, 9),
        three_made: three, three_attempted: three + between(1, 4),
        ft_made: ftm, ft_attempted: ftm + between(0, 3),
        total_rebounds: between(2, 11), off_rebounds: between(0, 4),
        total_assists: between(1, 8), total_steals: between(0, 3),
        total_blocks: between(0, 2), turnovers: between(0, 4), fouls: between(0, 4),
      }
    }
    if (sport === 'volleyball') {
      const kills = between(5, 16)
      return {
        pts_scored: kills + between(0, 6), kills, attacks: kills + between(6, 16),
        aces: between(0, 3), digs: between(2, 12), blocks: between(0, 4),
        assists: between(0, 22), errors: between(1, 5), serve_errors: between(0, 3),
        reception_errors: between(0, 2),
      }
    }
    return {
      pts_scored: between(18, 44), winners: between(6, 18), aces: between(1, 6), errors: between(2, 9),
    }
  }

  /** Period-by-period scores that add up to a decisive, believable result. */
  function periodScores(sport: Sport, winnerIsA: boolean) {
    if (sport === 'basketball') {
      const a: number[] = []
      const b: number[] = []
      for (let q = 0; q < 4; q++) {
        const hi = between(16, 26)
        const lo = between(12, hi - 1)
        a.push(winnerIsA ? hi : lo)
        b.push(winnerIsA ? lo : hi)
      }
      return {
        cols: { q1: a[0], q2: a[1], q3: a[2], q4: a[3] },
        colsB: { q1: b[0], q2: b[1], q3: b[2], q4: b[3] },
        totalA: a.reduce((x, y) => x + y, 0),
        totalB: b.reduce((x, y) => x + y, 0),
      }
    }
    if (sport === 'volleyball') {
      // 3-1: winner takes sets 1, 2, 4.
      const w = [25, 25, between(19, 23), 25]
      const l = [between(17, 23), between(18, 23), 25, between(16, 22)]
      const A = winnerIsA ? w : l
      const B = winnerIsA ? l : w
      return {
        cols: { set1: A[0], set2: A[1], set3: A[2], set4: A[3], sets_won: winnerIsA ? 3 : 1 },
        colsB: { set1: B[0], set2: B[1], set3: B[2], set4: B[3], sets_won: winnerIsA ? 1 : 3 },
        totalA: winnerIsA ? 3 : 1,
        totalB: winnerIsA ? 1 : 3,
      }
    }
    // Table tennis, best of 5 -> 3-1.
    const w = [11, 11, between(7, 9), 11]
    const l = [between(5, 9), between(6, 9), 11, between(4, 9)]
    const A = winnerIsA ? w : l
    const B = winnerIsA ? l : w
    return {
      cols: { game1: A[0], game2: A[1], game3: A[2], game4: A[3], games_won: winnerIsA ? 3 : 1 },
      colsB: { game1: B[0], game2: B[1], game3: B[2], game4: B[3], games_won: winnerIsA ? 1 : 3 },
      totalA: winnerIsA ? 3 : 1,
      totalB: winnerIsA ? 1 : 3,
    }
  }

  // ── Events ──────────────────────────────────────────────────────────────
  const SPORTS: Sport[] = ['basketball', 'volleyball', 'table-tennis']
  const sportLabel: Record<Sport, string> = {
    basketball: 'Basketball',
    volleyball: 'Volleyball',
    'table-tennis': 'Table Tennis',
  }
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    d.setHours(14, 0, 0, 0)
    return d.toISOString()
  }

  // events.slug is NOT NULL and UNIQUE, so the id is generated up front and
  // folded into the slug — the same approach routes/events.ts uses.
  function slugifyEventName(name: string, id: string): string {
    const base = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return `${base}-${id.replace(/-/g, '').slice(-6)}`
  }

  async function makeEvent(sport: Sport, name: string, status: string): Promise<string> {
    const eventId = randomUUID()
    // `events` has no start_date/end_date/venue columns — scheduling lives on
    // each match instead.
    const { data, error } = await supabase
      .from('events')
      .insert({
        id: eventId,
        name,
        slug: slugifyEventName(name, eventId),
        sport,
        season_id: seasonId,
        format: 'single_elim',
        status,
        created_by: adminId,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`event ${name}: ${error?.message}`)
    return data.id as string
  }

  /** Registers the 4 teams of a sport as participants of an event. */
  async function addParticipants(eventId: string, teamIds: string[]) {
    await supabase.from('event_participants').insert(
      teamIds.map((id) => ({ event_id: eventId, participant_id: id, participant_type: 'team' })),
    )
  }

  /** One semi-final pair + a final, the shape the bracket generator produces. */
  async function makeBracket(
    eventId: string,
    sport: Sport,
    teamIds: string[],
    mode: 'completed' | 'live',
    startOffset: number,
  ) {
    const venue = sport === 'basketball' ? 'NU Gym 1' : sport === 'volleyball' ? 'NU Gym 2' : 'NU Activity Hall'
    const semiPairs: [string, string][] = [
      [teamIds[0], teamIds[1]],
      [teamIds[2], teamIds[3]],
    ]

    const semiWinners: string[] = []
    const semiMatchIds: string[] = []

    for (let i = 0; i < semiPairs.length; i++) {
      const [aId, bId] = semiPairs[i]
      const winnerIsA = rnd() > 0.45
      const winnerId = winnerIsA ? aId : bId
      if (mode === 'completed') semiWinners.push(winnerId)

      const { data: br, error: brErr } = await supabase
        .from('brackets')
        .insert({
          event_id: eventId,
          round: 1,
          match_order: i + 1,
          bracket_type: 'winners',
          participant_a_id: aId,
          participant_b_id: bId,
          winner_id: mode === 'completed' ? winnerId : null,
          is_bye: false,
        })
        .select('id')
        .single()
      if (brErr || !br) throw new Error(`bracket: ${brErr?.message}`)

      const { data: match, error: mErr } = await supabase
        .from('matches')
        .insert({
          event_id: eventId,
          bracket_id: br.id,
          participant_a_id: aId,
          participant_b_id: bId,
          status: mode === 'completed' ? 'completed' : 'live',
          scheduled_at: day(startOffset + i),
          venue,
          ...(mode === 'completed'
            ? { finalized_at: day(startOffset + i), scored_by: adminId }
            : {}),
        })
        .select('id')
        .single()
      if (mErr || !match) throw new Error(`match: ${mErr?.message}`)
      const matchId = match.id as string
      semiMatchIds.push(matchId)

      if (mode === 'completed') {
        const ps = periodScores(sport, winnerIsA)
        await supabase.from('match_scores').insert([
          { match_id: matchId, participant_id: aId, sport, ...ps.cols },
          { match_id: matchId, participant_id: bId, sport, ...ps.colsB },
        ])
        for (const [teamId, isA] of [[aId, true], [bId, false]] as [string, boolean][]) {
          void isA
          const teamName = TEAMS.find((t) => teamIdByName.get(t.name) === teamId)!.name
          const roster = rosters.get(teamName)!
          const setup = SPORT_SETUP[sport]
          for (let p = 0; p < roster.length; p++) {
            await supabase.from('player_game_stats').insert({
              match_id: matchId,
              athlete_id: roster[p].athleteId,
              sport,
              stats: statsFor(sport, p < setup.active),
            })
          }
        }
      } else {
        // Live at 0-0: score rows exist (as POST /scoring/:id/start creates
        // them) but every column is left at its default zero, and no scoring
        // actions or player stats exist yet. The organizer claims the lock
        // themselves when they open the match.
        await supabase.from('match_scores').insert([
          { match_id: matchId, participant_id: aId, sport },
          { match_id: matchId, participant_id: bId, sport },
        ])
        // Mirror the active_lineup that starting the match would have seeded.
        const lineup: Record<string, string[]> = { a: [], b: [] }
        for (const [side, tid] of [['a', aId], ['b', bId]] as ['a' | 'b', string][]) {
          const teamName = TEAMS.find((t) => teamIdByName.get(t.name) === tid)!.name
          lineup[side] = rosters
            .get(teamName)!
            .slice(0, SPORT_SETUP[sport].active)
            .map((p) => p.athleteId)
        }
        await supabase.from('matches').update({ active_lineup: lineup }).eq('id', matchId)
      }
    }

    // Final
    const finalA = mode === 'completed' ? semiWinners[0] : null
    const finalB = mode === 'completed' ? semiWinners[1] : null
    const finalWinnerIsA = rnd() > 0.5
    const { data: finalBr } = await supabase
      .from('brackets')
      .insert({
        event_id: eventId,
        round: 2,
        match_order: 1,
        bracket_type: 'winners',
        participant_a_id: finalA,
        participant_b_id: finalB,
        winner_id: mode === 'completed' ? (finalWinnerIsA ? finalA : finalB) : null,
        is_bye: false,
      })
      .select('id')
      .single()

    const { data: finalMatch } = await supabase
      .from('matches')
      .insert({
        event_id: eventId,
        bracket_id: finalBr!.id,
        participant_a_id: finalA,
        participant_b_id: finalB,
        status: mode === 'completed' ? 'completed' : 'scheduled',
        scheduled_at: day(startOffset + 3),
        venue,
        ...(mode === 'completed'
          ? { finalized_at: day(startOffset + 3), scored_by: adminId }
          : {}),
      })
      .select('id')
      .single()

    if (mode === 'completed' && finalA && finalB) {
      const ps = periodScores(sport, finalWinnerIsA)
      await supabase.from('match_scores').insert([
        { match_id: finalMatch!.id, participant_id: finalA, sport, ...ps.cols },
        { match_id: finalMatch!.id, participant_id: finalB, sport, ...ps.colsB },
      ])
      for (const teamId of [finalA, finalB]) {
        const teamName = TEAMS.find((t) => teamIdByName.get(t.name) === teamId)!.name
        const roster = rosters.get(teamName)!
        const setup = SPORT_SETUP[sport]
        for (let p = 0; p < roster.length; p++) {
          await supabase.from('player_game_stats').insert({
            match_id: finalMatch!.id,
            athlete_id: roster[p].athleteId,
            sport,
            stats: statsFor(sport, p < setup.active),
          })
        }
      }
    }

    return { semiMatchIds, finalMatchId: finalMatch!.id as string }
  }

  console.log('\nCreating events')
  const completedMatchIds: string[] = []

  for (const sport of SPORTS) {
    const teamIds = TEAMS.filter((t) => t.sport === sport).map((t) => teamIdByName.get(t.name)!)

    const done = await makeEvent(sport, `${sportLabel[sport]} Preseason Cup`, 'completed')
    await addParticipants(done, teamIds)
    const r1 = await makeBracket(done, sport, teamIds, 'completed', -21)
    completedMatchIds.push(...r1.semiMatchIds, r1.finalMatchId)
    console.log(`  [completed]    ${sportLabel[sport]} Preseason Cup`)

    const running = await makeEvent(sport, `${sportLabel[sport]} Intramurals 2026`, 'in_progress')
    await addParticipants(running, teamIds)
    await makeBracket(running, sport, teamIds, 'live', 0)
    console.log(`  [in_progress]  ${sportLabel[sport]} Intramurals 2026   <- 2 LIVE matches at 0-0`)

    const upcoming = await makeEvent(sport, `${sportLabel[sport]} Championship Series`, 'registration')
    await addParticipants(upcoming, teamIds)
    console.log(`  [registration] ${sportLabel[sport]} Championship Series`)
  }

  // ── Aggregates ──────────────────────────────────────────────────────────
  console.log('\nRecomputing season stats')
  const allAthletes = Array.from(rosters.values()).flat()
  for (const p of allAthletes) {
    const { error } = await supabase.rpc('recompute_player_season_stats', {
      p_athlete_id: p.athleteId,
      p_season_id: seasonId,
    })
    if (error) console.warn(`  player stats warning (${p.name}): ${error.message}`)
  }
  for (const teamId of teamIdByName.values()) {
    const { error } = await supabase.rpc('recompute_team_season_stats', {
      p_team_id: teamId,
      p_season_id: seasonId,
    })
    if (error) console.warn(`  team stats warning: ${error.message}`)
  }

  console.log('Computing insights')
  try {
    const { computeInsightsForMatch } = await import('../services/computeInsights')
    for (const id of completedMatchIds) await computeInsightsForMatch(id, seasonId)
  } catch (e) {
    console.warn('  insights warning:', e instanceof Error ? e.message : e)
  }

  // ── Announcement ────────────────────────────────────────────────────────
  if (adminId) {
    await supabase.from('announcements').insert({
      title: 'Intramurals 2026 is underway',
      body: 'Semi-final matches are live across all three sports. Check the brackets for schedules.',
      type: 'reminder',
      urgency: 'normal',
      audience_type: 'all',
      created_by: adminId,
    })
  }

  console.log('\nDone.')
  console.log(`  ${TEAMS.length} teams, ${allAthletes.length} athletes, 9 events`)
  console.log(`  6 matches are LIVE at 0-0 (2 per sport) and ready for you to score`)
  console.log(`  Athlete login: <student_id>@${EMAIL_DOMAIN}  /  UrSports-<student_id>-2026!`)
  console.log(`  e.g. ${allAthletes[0].studentId}@${EMAIL_DOMAIN} / ${passwordFor(allAthletes[0].studentId)}\n`)
}

main().catch((e) => {
  console.error('\nFAILED:', e instanceof Error ? e.message : e)
  process.exit(1)
})
