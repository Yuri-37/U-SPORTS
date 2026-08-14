/**
 * Wipes competition data (and, with --wipe-staff, all staff but one Admin)
 * and reseeds a complete, realistic dataset for end-to-end testing.
 * Destructive — run deliberately, against a database you've backed up.
 *
 *   pnpm --filter server reset:seed                       (asks for confirmation)
 *   pnpm --filter server reset:seed -- --yes               (skips it)
 *   pnpm --filter server reset:seed -- --yes --wipe-staff   (also removes every
 *                                                            staff login but one)
 *
 * This script NEVER sends invitation emails — see the "ZERO EMAILS" note
 * below. Every account it creates (staff or athlete) is a direct
 * auth.admin.createUser({ email_confirm: true }) call, the same suppressed-
 * mail path every account in this codebase already used before invitations
 * existed. ~90 accounts created in one run would instantly blow a real
 * mail provider's daily cap and could damage sending-domain reputation with
 * bounces from fake addresses.
 *
 * PRESERVED, always: institution (school branding), sports_config.
 *
 * PRESERVED, unless --wipe-staff: every staff login (profiles with a role:
 * Admin / Organizer / Coach) and their auth users, plus every existing
 * season. Deleting those would lock you out of your own app.
 *
 * WITH --wipe-staff: every staff login except ONE Admin is deleted too (the
 * earliest-created Admin, unless RESET_SEED_KEEP_PROFILE_ID names a specific
 * profile to keep instead), and 3 seasons + a small demo Organizer/Coach
 * roster are created from scratch so the season_sports / season_staff
 * intersection rule has something to demonstrate. Without --wipe-staff,
 * existing staff are left alone and are simply assigned to the 3 new seasons
 * (mirroring migration 065's own backfill), so nobody who already had access
 * loses it.
 *
 * DELETED (always): all athletes + their auth users, teams, events,
 * brackets, matches, scores, stats, insights, notifications, announcements,
 * audit logs, and the season_sports/season_staff/seasons this script itself
 * seeds (so re-runs are clean, not additive).
 *
 * SEEDED: 3 seasons (completed / active / draft — the draft one carries only
 * 2 of 3 sports, so the season-scoped sport dropdown has something to show
 * narrowing), 12 teams across 3 sports, ~87 athletes, and 9 events per sport
 * layout:
 *   - "<Sport> Regular Season"        completed, round-robin, 12 matches
 *     (double round robin across the sport's 4 teams) with full box scores
 *     engineered so trending insights actually fire in both directions —
 *     see the stat-generation notes below.
 *   - "<Sport> Intramurals 2026"      in_progress, 2 matches LIVE at 0-0
 *   - "<Sport> Championship Series"   registration, no matches yet
 *
 * ── Why 6 games per athlete, not 3 ──────────────────────────────────────
 * computeInsights.ts compares a rolling-3-game average against the season
 * average. With N <= 3 games, "last 3" IS every game, so the delta is
 * exactly 0 and the code path that fires actively DELETES any trend. Six
 * games (double round robin) makes "first 3" and "last 3" genuinely
 * different windows: with L = mean(games 1-3) and H = mean(games 4-6),
 * delta = (H-L)/(H+L), and the 10% threshold needs H/L >= 1.223 (up) or
 * <= 0.818 (down). Each athlete gets a fixed per-athlete stat baseline
 * (drawn once, not re-rolled per game) and a trend role by
 * athleteIdx % 3: 0 = up (x1.45 in games 4-6, delta ~= +18%), 1 = down
 * (x0.62, delta ~= -23%), 2 = steady (x1.0, stays under the threshold).
 * Leg 1 of the round robin (6 matches, one per team pairing) is scheduled
 * entirely before leg 2, so for every team "games 1-3" and "games 4-6"
 * cleanly correspond to the two legs without needing separate per-team
 * indexing.
 */

import path from 'path'
import readline from 'readline'
import { randomUUID } from 'crypto'
import dotenv from 'dotenv'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const EMAIL_DOMAIN = 'students.nu-dasma.edu.ph'
const STAFF_EMAIL_DOMAIN = 'nu-dasma.edu.ph'
type Sport = 'basketball' | 'volleyball' | 'table-tennis'

// Matches the athlete importer's convention (apps/server/src/routes/students.ts)
// so a seeded athlete's password is predictable for testing.
const passwordFor = (studentId: string) => `UrSports-${studentId}-2026!`
const STAFF_PASSWORD = 'UrSportsStaff-2026!'

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
const jitter = () => 0.92 + rnd() * 0.16 // +/-8%

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

async function wipe(supabase: SupabaseClient, wipeStaff: boolean) {
  // Child-first so foreign keys never block a delete. season_staff and
  // season_sports must precede seasons (their own FK target); seasons must
  // precede profiles below -- seasons.created_by -> profiles(id) has no
  // ON DELETE clause, so wiping profiles first would hard-fail the delete.
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
    'season_staff',
    'season_sports',
    'seasons',
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

  // Athlete logins: a profile with no role. Staff (Admin/Organizer/Coach) are
  // handled separately below, since whether they're kept depends on --wipe-staff.
  const { data: allProfiles } = await supabase.from('profiles').select('id, email, role')
  const staffProfiles = (allProfiles ?? []).filter((p) => p.role != null)
  const athleteProfiles = (allProfiles ?? []).filter((p) => p.role == null)

  console.log(`\nDeleting ${athleteProfiles.length} athlete login(s)`)
  let removed = 0
  for (const p of athleteProfiles) {
    await supabase.from('profiles').delete().eq('id', p.id as string)
    const { error } = await supabase.auth.admin.deleteUser(p.id as string)
    if (!error) removed++
  }
  console.log(`  ${removed} auth users removed`)

  if (!wipeStaff) {
    // organizers rows for kept staff are left untouched -- season_staff for
    // them was just wiped above along with every other season_staff row, and
    // is rebuilt in seedSeasonsAndStaff() below.
    console.log(`\nKeeping ${staffProfiles.length} staff login(s) (pass --wipe-staff to remove):`)
    for (const s of staffProfiles) console.log(`  ${s.role}  ${s.email}`)
    return
  }

  // --wipe-staff: keep exactly one Admin (RESET_SEED_KEEP_PROFILE_ID if set,
  // else the earliest-created Admin), delete every other staff login.
  const { data: admins } = await supabase
    .from('profiles')
    .select('id, email, created_at')
    .eq('role', 'Admin')
    .order('created_at', { ascending: true })
  if (!admins || admins.length === 0) {
    throw new Error('--wipe-staff aborted: no Admin account exists to keep. Nothing was deleted.')
  }
  const keepId = process.env.RESET_SEED_KEEP_PROFILE_ID?.trim() || (admins[0].id as string)
  const keepAdmin =
    admins.find((a) => a.id === keepId) ?? (() => {
      throw new Error(
        `--wipe-staff aborted: RESET_SEED_KEEP_PROFILE_ID=${keepId} does not match any Admin profile. Nothing was deleted.`,
      )
    })()

  const toDelete = staffProfiles.filter((s) => s.id !== keepAdmin.id)
  console.log(`\n--wipe-staff: keeping ${keepAdmin.email} (${keepAdmin.id})`)
  console.log(`Deleting ${toDelete.length} other staff login(s):`)
  for (const s of toDelete) console.log(`  ${s.role}  ${s.email}`)

  let staffRemoved = 0
  for (const s of toDelete) {
    await supabase.from('organizers').delete().eq('profile_id', s.id as string)
    await supabase.from('profiles').delete().eq('id', s.id as string)
    const { error } = await supabase.auth.admin.deleteUser(s.id as string)
    if (!error) staffRemoved++
  }
  console.log(`  ${staffRemoved} staff auth users removed`)
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url?.trim() || !key?.trim()) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/server/.env')
    process.exit(1)
  }
  const supabase = createClient(url, key)
  const wipeStaff = process.argv.includes('--wipe-staff')

  console.log(`\nTarget database: ${url}`)
  if (wipeStaff) {
    console.log('--wipe-staff: every staff login except ONE Admin will be deleted.')
  }

  if (!process.argv.includes('--yes')) {
    const msg = wipeStaff
      ? '\nThis DELETES all athletes, teams, events, matches, stats, AND every staff login but one Admin.\nType DELETE to continue: '
      : '\nThis DELETES all athletes, teams, events, matches and stats.\nType DELETE to continue: '
    const ok = await confirm(msg)
    if (!ok) {
      console.log('Aborted — nothing was changed.')
      process.exit(0)
    }
  }

  await wipe(supabase, wipeStaff)

  // ── Seasons, sports, staff ──────────────────────────────────────────────
  console.log('\nCreating seasons')
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    d.setHours(14, 0, 0, 0)
    return d
  }
  const isoDate = (d: Date) => d.toISOString().slice(0, 10)

  async function makeSeason(
    name: string,
    status: 'completed' | 'active' | 'draft',
    startOffsetDays: number,
    endOffsetDays: number,
    sports: Sport[],
  ): Promise<string> {
    const { data, error } = await supabase
      .from('seasons')
      .insert({
        name,
        status,
        start_date: isoDate(day(startOffsetDays)),
        end_date: isoDate(day(endOffsetDays)),
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`season ${name}: ${error?.message}`)
    const seasonId = data.id as string
    await supabase.from('season_sports').insert(sports.map((sport) => ({ season_id: seasonId, sport })))
    return seasonId
  }

  const completedSeasonId = await makeSeason('AY 2025-2026', 'completed', -400, -200, [
    'basketball', 'volleyball', 'table-tennis',
  ])
  // Deliberately a PAST start date on the ACTIVE season -- this is the
  // legitimate case seasonDates.ts's edit-mode rule exists to protect: an
  // already-running season's historical start date must stay saveable.
  const activeSeasonId = await makeSeason('AY 2026-2027', 'active', -60, 120, [
    'basketball', 'volleyball', 'table-tennis',
  ])
  // Only 2 of 3 sports -- makes "the sport dropdown narrows by season"
  // visible with zero manual setup.
  const draftSeasonId = await makeSeason('AY 2027-2028', 'draft', 150, 400, [
    'basketball', 'volleyball',
  ])
  console.log(`  AY 2025-2026  completed  (all 3 sports)`)
  console.log(`  AY 2026-2027  active     (all 3 sports) <- seeded below`)
  console.log(`  AY 2027-2028  draft      (basketball, volleyball only)`)

  const seasonId = activeSeasonId
  const { data: admin } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'Admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const adminId = (admin?.id as string) ?? null
  if (!adminId) throw new Error('No Admin profile exists after wipe -- cannot continue.')

  // Every CURRENT organizer gets all 3 new seasons -- mirrors migration
  // 065's own backfill, so nobody who already had access loses it.
  const { data: existingOrganizers } = await supabase.from('organizers').select('id')
  const allSeasonIds = [completedSeasonId, activeSeasonId, draftSeasonId]
  if (existingOrganizers && existingOrganizers.length > 0) {
    await supabase.from('season_staff').insert(
      existingOrganizers.flatMap((o) =>
        allSeasonIds.map((sid) => ({ season_id: sid, organizer_id: o.id as string })),
      ),
    )
    console.log(`  Assigned ${existingOrganizers.length} existing organizer(s) to all 3 seasons`)
  }

  // Demo staff only makes sense right after --wipe-staff, when there's
  // nobody else to assign narrowly -- otherwise this would just pile
  // synthetic accounts on top of the real roster on every run.
  if (wipeStaff) {
    console.log('\nCreating demo staff')
    type DemoStaff = {
      email: string
      full_name: string
      role: 'Organizer' | 'Coach'
      department: string | null
      assigned_sports: Sport[]
      seasonIds: string[]
    }
    const demoStaff: DemoStaff[] = [
      // One sport, one season -- the narrowest case.
      {
        email: `organizer.bb.active@${STAFF_EMAIL_DOMAIN}`,
        full_name: 'Organizer (Basketball, Active season only)',
        role: 'Organizer', department: null, assigned_sports: ['basketball'],
        seasonIds: [activeSeasonId],
      },
      // Two sports, two seasons.
      {
        email: `organizer.vb.tt@${STAFF_EMAIL_DOMAIN}`,
        full_name: 'Organizer (Volleyball + Table Tennis, 2 seasons)',
        role: 'Organizer', department: null, assigned_sports: ['volleyball', 'table-tennis'],
        seasonIds: [activeSeasonId, draftSeasonId],
      },
      // All sports, all seasons -- effectively unrestricted, non-Admin.
      {
        email: `organizer.all@${STAFF_EMAIL_DOMAIN}`,
        full_name: 'Organizer (All sports, all seasons)',
        role: 'Organizer', department: null,
        assigned_sports: ['basketball', 'volleyball', 'table-tennis'],
        seasonIds: allSeasonIds,
      },
      // Coaches: one sport each, respecting one-coach-per-sport-per-department.
      { email: `coach.sbma.bb@${STAFF_EMAIL_DOMAIN}`, full_name: 'Coach (SBMA Basketball)', role: 'Coach', department: 'SBMA', assigned_sports: ['basketball'], seasonIds: [activeSeasonId] },
      { email: `coach.seca.vb@${STAFF_EMAIL_DOMAIN}`, full_name: 'Coach (SECA Volleyball)', role: 'Coach', department: 'SECA', assigned_sports: ['volleyball'], seasonIds: [activeSeasonId] },
      { email: `coach.sase.tt@${STAFF_EMAIL_DOMAIN}`, full_name: 'Coach (SASE Table Tennis)', role: 'Coach', department: 'SASE', assigned_sports: ['table-tennis'], seasonIds: [activeSeasonId] },
      { email: `coach.shs.bb@${STAFF_EMAIL_DOMAIN}`, full_name: 'Coach (SHS Basketball)', role: 'Coach', department: 'SHS', assigned_sports: ['basketball'], seasonIds: [activeSeasonId] },
    ]
    for (const s of demoStaff) {
      // ZERO EMAILS: createUser + email_confirm, never the invite helper --
      // see the file header. A script must not be able to send real mail
      // even by mistake.
      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email: s.email, password: STAFF_PASSWORD, email_confirm: true,
        app_metadata: { role: s.role }, user_metadata: { full_name: s.full_name, department: s.department },
      })
      if (authErr || !authUser?.user) { console.warn(`  staff ${s.email}: ${authErr?.message}`); continue }
      await supabase.from('profiles').upsert({
        id: authUser.user.id, email: s.email, full_name: s.full_name, role: s.role, department: s.department,
      })
      const { data: org, error: orgErr } = await supabase
        .from('organizers')
        .upsert({ profile_id: authUser.user.id, assigned_sports: s.assigned_sports, is_active: true })
        .select('id')
        .single()
      if (orgErr || !org) { console.warn(`  organizer row ${s.email}: ${orgErr?.message}`); continue }
      await supabase
        .from('season_staff')
        .insert(s.seasonIds.map((sid) => ({ season_id: sid, organizer_id: org.id as string, assigned_by: adminId })))
      console.log(`  ${s.role.padEnd(9)} ${s.email}`)
    }
    console.log(`  Password for all demo staff: ${STAFF_PASSWORD}`)
  }

  // ── Athletes + teams ────────────────────────────────────────────────────
  console.log('\nCreating teams and athletes')
  type Player = { athleteId: string; profileId: string; name: string; studentId: string }
  const rosters = new Map<string, Player[]>()
  const teamIdByName = new Map<string, string>()
  const teamIdBySportIdx = new Map<Sport, string[]>() // ordered [0..3] per sport, for round-robin pairing
  let athleteIdx = 0

  async function createAthlete(
    fullName: string,
    department: string,
    sport: Sport,
    position: string,
    jersey: number,
  ): Promise<Player> {
    const studentId = `2023-${String(170000 + athleteIdx * 131).slice(0, 6)}`
    const email = `${studentId}@${EMAIL_DOMAIN}`
    // ZERO EMAILS -- see file header. Same suppressed-mail createUser call
    // every athlete account in this codebase already used.
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email, password: passwordFor(studentId), email_confirm: true, user_metadata: { full_name: fullName },
    })
    if (authErr || !authUser?.user) throw new Error(`auth ${email}: ${authErr?.message}`)
    const profileId = authUser.user.id
    await supabase.from('profiles').upsert({ id: profileId, email, full_name: fullName, role: null, department })
    const pool = yearLevelsFor(department)
    // NOTE: `athletes` has no `course` column -- the import template collects
    // it but the importer drops it too (see routes/students.ts).
    const { data: ath, error: athErr } = await supabase
      .from('athletes')
      .insert({
        profile_id: profileId, student_id: studentId, sport, position, jersey_number: String(jersey),
        year_level: pool[athleteIdx % pool.length], department, season_status: 'active',
      })
      .select('id')
      .single()
    if (athErr || !ath) throw new Error(`athlete ${email}: ${athErr?.message}`)
    athleteIdx++
    return { athleteId: ath.id as string, profileId, name: fullName, studentId }
  }

  const debutAthleteId = new Map<Sport, string>()
  const debutTeamId = new Map<Sport, string>()

  for (const sport of ['basketball', 'volleyball', 'table-tennis'] as Sport[]) {
    teamIdBySportIdx.set(sport, [])
  }

  for (const team of TEAMS) {
    const setup = SPORT_SETUP[team.sport]
    const { data: created, error: teamErr } = await supabase
      .from('teams')
      .insert({ name: team.name, sport: team.sport, season_id: seasonId, department: team.department })
      .select('id')
      .single()
    if (teamErr || !created) throw new Error(`team ${team.name}: ${teamErr?.message}`)
    const teamId = created.id as string
    teamIdByName.set(team.name, teamId)
    teamIdBySportIdx.get(team.sport)!.push(teamId)

    const roster: Player[] = []
    for (let i = 0; i < setup.squad; i++) {
      const p = await createAthlete(
        nameFor(athleteIdx), team.department, team.sport,
        setup.positions[i % setup.positions.length], i + 1,
      )
      await supabase.from('team_members').insert({
        team_id: teamId, athlete_id: p.athleteId, lineup_slot: i < setup.active ? i + 1 : null,
      })
      roster.push(p)
    }

    // One extra bench "debut" athlete per sport, on that sport's first team --
    // gives computeDebutStandout a real single-game case to fire on. Excluded
    // from the round-robin's regular per-game stat generation below.
    if (!debutAthleteId.has(team.sport)) {
      const p = await createAthlete(
        nameFor(athleteIdx), team.department, team.sport, setup.positions[0], setup.squad + 1,
      )
      await supabase.from('team_members').insert({ team_id: teamId, athlete_id: p.athleteId, lineup_slot: null })
      roster.push(p)
      debutAthleteId.set(team.sport, p.athleteId)
      debutTeamId.set(team.sport, teamId)
    }

    rosters.set(team.name, roster)
    console.log(`  ${team.name.padEnd(20)} ${team.sport.padEnd(13)} ${roster.length} players`)
  }

  // ── Stat generators ─────────────────────────────────────────────────────
  type TrendRole = 'up' | 'down' | 'steady'
  const TREND_FACTOR: Record<TrendRole, number> = { up: 1.45, down: 0.62, steady: 1.0 }
  function trendRoleFor(rosterIdx: number): TrendRole {
    const m = rosterIdx % 3
    return m === 0 ? 'up' : m === 1 ? 'down' : 'steady'
  }

  type StatBase = Record<string, number>

  /** Per-athlete fixed average, drawn once (not re-rolled per game) so a
   *  trend multiplier applied to games 4-6 produces a real, detectable
   *  shift instead of disappearing into fresh-per-game noise. KEY_STATS
   *  fields (computeInsights.ts) are floored so round(base * 0.62) can't
   *  collapse to 0 and erase a "trending down" signal. */
  function baseStatsFor(sport: Sport, starter: boolean): StatBase {
    if (sport === 'basketball') {
      if (!starter) {
        return {
          fg_made: between(1, 3), fg_attempted: between(3, 7),
          three_made: between(0, 1), three_attempted: between(0, 2),
          ft_made: between(0, 2), ft_attempted: between(0, 2),
          total_rebounds: between(1, 4), off_rebounds: between(0, 1),
          total_assists: between(1, 3), total_steals: between(4, 5),
          total_blocks: between(0, 1), turnovers: between(0, 2), fouls: between(0, 2),
        }
      }
      return {
        fg_made: between(4, 10), fg_attempted: between(9, 16),
        three_made: between(0, 4), three_attempted: between(1, 7),
        ft_made: between(1, 7), ft_attempted: between(2, 9),
        total_rebounds: between(3, 10), off_rebounds: between(0, 4),
        total_assists: between(2, 8), total_steals: between(4, 8),
        total_blocks: between(0, 3), turnovers: between(1, 4), fouls: between(1, 4),
      }
    }
    if (sport === 'volleyball') {
      if (!starter) {
        return {
          kills: between(1, 3), attacks: between(2, 6), aces: between(0, 1),
          digs: between(1, 3), blocks: between(4, 5), assists: between(0, 2),
          errors: between(0, 2), serve_errors: between(0, 1), reception_errors: between(0, 1),
        }
      }
      return {
        kills: between(5, 14), attacks: between(11, 24), aces: between(0, 3),
        digs: between(2, 10), blocks: between(4, 7), assists: between(0, 18),
        errors: between(1, 4), serve_errors: between(0, 2), reception_errors: between(0, 2),
      }
    }
    // table-tennis
    if (!starter) {
      return { pts_scored: between(6, 12), winners: between(2, 5), aces: between(0, 1), errors: between(2, 4) }
    }
    return { pts_scored: between(18, 40), winners: between(6, 16), aces: between(1, 5), errors: between(2, 8) }
  }

  /** One game's stat line: the athlete's fixed base scaled by the
   *  season-phase multiplier (1.0 for games 1-3, their trend factor for
   *  games 4-6), each field independently jittered, then derived totals
   *  (total_points, pts_scored) recomputed from the SCALED components --
   *  scaling the total independently would leave a box score whose parts
   *  don't add up to it. */
  function gameStatsFrom(sport: Sport, base: StatBase, multiplier: number): Record<string, number> {
    const scale = (key: string) => Math.max(0, Math.round((base[key] ?? 0) * multiplier * jitter()))

    if (sport === 'basketball') {
      const fgMade = scale('fg_made')
      const threeMade = scale('three_made')
      const ftMade = scale('ft_made')
      return {
        total_points: fgMade * 2 + threeMade + ftMade,
        fg_made: fgMade, fg_attempted: Math.max(fgMade, scale('fg_attempted')),
        three_made: threeMade, three_attempted: Math.max(threeMade, scale('three_attempted')),
        ft_made: ftMade, ft_attempted: Math.max(ftMade, scale('ft_attempted')),
        total_rebounds: scale('total_rebounds'), off_rebounds: scale('off_rebounds'),
        total_assists: scale('total_assists'), total_steals: scale('total_steals'),
        total_blocks: scale('total_blocks'), turnovers: scale('turnovers'),
        fouls: Math.min(scale('fouls'), 5),
      }
    }
    if (sport === 'volleyball') {
      const kills = scale('kills')
      const aces = scale('aces')
      return {
        pts_scored: kills + aces,
        kills, attacks: Math.max(kills, scale('attacks')), aces,
        digs: scale('digs'), blocks: scale('blocks'), assists: scale('assists'),
        errors: scale('errors'), serve_errors: scale('serve_errors'), reception_errors: scale('reception_errors'),
      }
    }
    return { pts_scored: scale('pts_scored'), winners: scale('winners'), aces: scale('aces'), errors: scale('errors') }
  }

  const DEBUT_STATS: Record<Sport, Record<string, number>> = {
    basketball: { total_points: 24, fg_made: 9, fg_attempted: 16, three_made: 2, three_attempted: 5, ft_made: 4, ft_attempted: 5, total_rebounds: 7, off_rebounds: 2, total_assists: 6, total_steals: 3, total_blocks: 1, turnovers: 2, fouls: 2 },
    volleyball: { pts_scored: 12, kills: 9, attacks: 15, aces: 2, digs: 4, blocks: 1, assists: 3, errors: 2, serve_errors: 1, reception_errors: 0 },
    'table-tennis': { pts_scored: 33, winners: 12, aces: 3, errors: 4 },
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
      }
    }
    if (sport === 'volleyball') {
      const w = [25, 25, between(19, 23), 25]
      const l = [between(17, 23), between(18, 23), 25, between(16, 22)]
      const A = winnerIsA ? w : l
      const B = winnerIsA ? l : w
      return {
        cols: { set1: A[0], set2: A[1], set3: A[2], set4: A[3], sets_won: winnerIsA ? 3 : 1 },
        colsB: { set1: B[0], set2: B[1], set3: B[2], set4: B[3], sets_won: winnerIsA ? 1 : 3 },
      }
    }
    const w = [11, 11, between(7, 9), 11]
    const l = [between(5, 9), between(6, 9), 11, between(4, 9)]
    const A = winnerIsA ? w : l
    const B = winnerIsA ? l : w
    return {
      cols: { game1: A[0], game2: A[1], game3: A[2], game4: A[3], games_won: winnerIsA ? 3 : 1 },
      colsB: { game1: B[0], game2: B[1], game3: B[2], game4: B[3], games_won: winnerIsA ? 1 : 3 },
    }
  }

  // ── Events ──────────────────────────────────────────────────────────────
  const SPORTS: Sport[] = ['basketball', 'volleyball', 'table-tennis']
  const sportLabel: Record<Sport, string> = {
    basketball: 'Basketball', volleyball: 'Volleyball', 'table-tennis': 'Table Tennis',
  }

  function slugifyEventName(name: string, id: string): string {
    const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    return `${base}-${id.replace(/-/g, '').slice(-6)}`
  }

  async function makeEvent(
    sport: Sport, name: string, status: string, format: string, ttFormat?: 'singles' | 'doubles',
  ): Promise<string> {
    const eventId = randomUUID()
    const { data, error } = await supabase
      .from('events')
      .insert({
        id: eventId, name, slug: slugifyEventName(name, eventId), sport, season_id: seasonId,
        format, status, created_by: adminId,
        table_tennis_format: sport === 'table-tennis' ? (ttFormat ?? 'singles') : null,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`event ${name}: ${error?.message}`)
    return data.id as string
  }

  async function addParticipants(eventId: string, teamIds: string[]) {
    await supabase.from('event_participants').insert(
      teamIds.map((id) => ({ event_id: eventId, participant_id: id, participant_type: 'team' })),
    )
  }

  /** Double round robin across a sport's 4 teams: every pair plays twice, 12
   *  matches total. Leg 1 (6 matches) is entirely scheduled before leg 2 (the
   *  other 6), so for every team "games 1-3" and "games 4-6" cleanly
   *  correspond to the two legs -- see the file header for why that matters. */
  async function makeRegularSeason(eventId: string, sport: Sport, teamIds: string[]): Promise<string[]> {
    const venue = sport === 'basketball' ? 'NU Gym 1' : sport === 'volleyball' ? 'NU Gym 2' : 'NU Activity Hall'
    const pairs: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]
    const setup = SPORT_SETUP[sport]
    const debutId = debutAthleteId.get(sport) ?? null
    const debutTeam = debutTeamId.get(sport) ?? null

    const athleteState = new Map<string, { base: StatBase; role: TrendRole }>()
    for (const teamId of teamIds) {
      const teamName = [...teamIdByName.entries()].find(([, id]) => id === teamId)![0]
      const roster = rosters.get(teamName)!
      roster.forEach((p, i) => {
        if (p.athleteId === debutId) return
        athleteState.set(p.athleteId, { base: baseStatsFor(sport, i < setup.active), role: trendRoleFor(i) })
      })
    }

    const completedMatchIds: string[] = []
    let matchOrder = 0
    let lastMatchForDebutTeam = ''

    for (let leg = 1; leg <= 2; leg++) {
      for (const [pi, pj] of pairs) {
        const aIdx = leg === 1 ? pi : pj
        const bIdx = leg === 1 ? pj : pi
        const aId = teamIds[aIdx]
        const bId = teamIds[bIdx]
        const winnerIsA = rnd() > 0.5
        const scheduledAt = (() => {
          const d = new Date()
          d.setDate(d.getDate() + (-19 + matchOrder)) // -19..-8, leg1 strictly before leg2
          d.setHours(14, 0, 0, 0)
          return d.toISOString()
        })()

        const { data: br, error: brErr } = await supabase
          .from('brackets')
          .insert({
            event_id: eventId, round: 1, match_order: matchOrder, bracket_type: 'round_robin',
            participant_a_id: aId, participant_b_id: bId, winner_id: winnerIsA ? aId : bId, is_bye: false,
          })
          .select('id')
          .single()
        if (brErr || !br) throw new Error(`round-robin bracket: ${brErr?.message}`)

        const { data: match, error: mErr } = await supabase
          .from('matches')
          .insert({
            event_id: eventId, bracket_id: br.id, participant_a_id: aId, participant_b_id: bId,
            status: 'completed', scheduled_at: scheduledAt, venue,
            finalized_at: scheduledAt, scored_by: adminId,
          })
          .select('id')
          .single()
        if (mErr || !match) throw new Error(`round-robin match: ${mErr?.message}`)
        const matchId = match.id as string
        completedMatchIds.push(matchId)
        if (aId === debutTeam || bId === debutTeam) lastMatchForDebutTeam = matchId

        const ps = periodScores(sport, winnerIsA)
        await supabase.from('match_scores').insert([
          { match_id: matchId, participant_id: aId, sport, ...ps.cols },
          { match_id: matchId, participant_id: bId, sport, ...ps.colsB },
        ])

        const statRows: { match_id: string; athlete_id: string; sport: Sport; stats: Record<string, number>; created_at: string }[] = []
        for (const teamId of [aId, bId]) {
          const teamName = [...teamIdByName.entries()].find(([, id]) => id === teamId)![0]
          const roster = rosters.get(teamName)!
          for (const p of roster) {
            if (p.athleteId === debutId) continue
            const st = athleteState.get(p.athleteId)!
            const multiplier = leg === 1 ? 1.0 : TREND_FACTOR[st.role]
            statRows.push({
              match_id: matchId, athlete_id: p.athleteId, sport,
              stats: gameStatsFrom(sport, st.base, multiplier), created_at: scheduledAt,
            })
          }
        }
        if (statRows.length > 0) {
          const { error } = await supabase.from('player_game_stats').insert(statRows)
          if (error) throw new Error(`player_game_stats (${sport} leg${leg}): ${error.message}`)
        }
        matchOrder++
      }
    }

    if (debutId && lastMatchForDebutTeam) {
      await supabase.from('player_game_stats').insert({
        match_id: lastMatchForDebutTeam, athlete_id: debutId, sport, stats: DEBUT_STATS[sport],
        created_at: new Date().toISOString(),
      })
    }

    return completedMatchIds
  }

  /** One semi-final pair + a final, LIVE at 0-0 -- unchanged from before. */
  async function makeLiveBracket(eventId: string, sport: Sport, teamIds: string[]) {
    const venue = sport === 'basketball' ? 'NU Gym 1' : sport === 'volleyball' ? 'NU Gym 2' : 'NU Activity Hall'
    const semiPairs: [string, string][] = [[teamIds[0], teamIds[1]], [teamIds[2], teamIds[3]]]

    for (let i = 0; i < semiPairs.length; i++) {
      const [aId, bId] = semiPairs[i]
      const { data: br, error: brErr } = await supabase
        .from('brackets')
        .insert({
          event_id: eventId, round: 1, match_order: i + 1, bracket_type: 'winners',
          participant_a_id: aId, participant_b_id: bId, winner_id: null, is_bye: false,
        })
        .select('id')
        .single()
      if (brErr || !br) throw new Error(`live bracket: ${brErr?.message}`)

      const { data: match, error: mErr } = await supabase
        .from('matches')
        .insert({
          event_id: eventId, bracket_id: br.id, participant_a_id: aId, participant_b_id: bId,
          status: 'live', scheduled_at: new Date().toISOString(), venue,
        })
        .select('id')
        .single()
      if (mErr || !match) throw new Error(`live match: ${mErr?.message}`)
      const matchId = match.id as string

      // Live at 0-0: score rows exist (as POST /scoring/:id/start creates
      // them) but every column is left at its default zero.
      await supabase.from('match_scores').insert([
        { match_id: matchId, participant_id: aId, sport },
        { match_id: matchId, participant_id: bId, sport },
      ])
      const lineup: Record<string, string[]> = { a: [], b: [] }
      for (const [side, tid] of [['a', aId], ['b', bId]] as ['a' | 'b', string][]) {
        const teamName = [...teamIdByName.entries()].find(([, id]) => id === tid)![0]
        lineup[side] = rosters.get(teamName)!.slice(0, SPORT_SETUP[sport].active).map((p) => p.athleteId)
      }
      await supabase.from('matches').update({ active_lineup: lineup }).eq('id', matchId)
    }

    // Scheduled final, no participants assigned yet.
    const { data: finalBr } = await supabase
      .from('brackets')
      .insert({
        event_id: eventId, round: 2, match_order: 1, bracket_type: 'winners',
        participant_a_id: null, participant_b_id: null, winner_id: null, is_bye: false,
      })
      .select('id')
      .single()
    await supabase.from('matches').insert({
      event_id: eventId, bracket_id: finalBr!.id, participant_a_id: null, participant_b_id: null,
      status: 'scheduled', scheduled_at: new Date().toISOString(),
      venue: sport === 'basketball' ? 'NU Gym 1' : sport === 'volleyball' ? 'NU Gym 2' : 'NU Activity Hall',
    })
  }

  console.log('\nCreating events')
  const completedMatchIds: string[] = []

  for (const sport of SPORTS) {
    const teamIds = teamIdBySportIdx.get(sport)!

    const regular = await makeEvent(sport, `${sportLabel[sport]} Regular Season`, 'completed', 'round_robin')
    await addParticipants(regular, teamIds)
    const rrMatchIds = await makeRegularSeason(regular, sport, teamIds)
    completedMatchIds.push(...rrMatchIds)
    console.log(`  [completed]    ${sportLabel[sport]} Regular Season       <- 12 matches, double round robin`)

    const running = await makeEvent(sport, `${sportLabel[sport]} Intramurals 2026`, 'in_progress', 'single_elim')
    await addParticipants(running, teamIds)
    await makeLiveBracket(running, sport, teamIds)
    console.log(`  [in_progress]  ${sportLabel[sport]} Intramurals 2026     <- 2 LIVE matches at 0-0`)

    const upcoming = await makeEvent(sport, `${sportLabel[sport]} Championship Series`, 'registration', 'single_elim')
    await addParticipants(upcoming, teamIds)
    console.log(`  [registration] ${sportLabel[sport]} Championship Series`)
  }

  // ── Aggregates ──────────────────────────────────────────────────────────
  console.log('\nRecomputing season stats')
  const allAthletes = Array.from(rosters.values()).flat()
  for (const p of allAthletes) {
    const { error } = await supabase.rpc('recompute_player_season_stats', {
      p_athlete_id: p.athleteId, p_season_id: seasonId,
    })
    if (error) console.warn(`  player stats warning (${p.name}): ${error.message}`)
  }
  for (const teamId of teamIdByName.values()) {
    const { error } = await supabase.rpc('recompute_team_season_stats', {
      p_team_id: teamId, p_season_id: seasonId,
    })
    if (error) console.warn(`  team stats warning: ${error.message}`)
  }

  console.log(`Computing insights for ${completedMatchIds.length} completed matches`)
  const { computeInsightsForMatch } = await import('../services/computeInsights')
  // Chronological order: the athlete-level "last 3 games" window is decided
  // purely by created_at, but processing in order means each match's
  // insights reflect the state at that point in time, and the LAST matches
  // processed are the ones most likely to survive insights.ts's .limit(30).
  for (const id of completedMatchIds) {
    try {
      await computeInsightsForMatch(id, seasonId)
    } catch (e) {
      console.warn(`  insights warning (match ${id}):`, e instanceof Error ? e.message : e)
    }
  }

  // ── Hard assertion: prove trending actually fired ──────────────────────
  const { data: trendRows, error: trendErr } = await supabase
    .from('insights')
    .select('insight_type')
    .eq('season_id', seasonId)
    .in('insight_type', ['trending_up', 'trending_down'])
  if (trendErr) {
    console.error(`\nFAILED: could not verify trending insights: ${trendErr.message}`)
    process.exit(1)
  }
  const up = (trendRows ?? []).filter((r) => r.insight_type === 'trending_up').length
  const down = (trendRows ?? []).filter((r) => r.insight_type === 'trending_down').length
  console.log(`\nTrending insights: ${up} up, ${down} down`)
  if (up < 20 || down < 20) {
    console.error(
      `\nFAILED: expected at least 20 trending_up and 20 trending_down insights, got ${up} up / ${down} down.\n` +
        'The seed data did not produce a real trend signal -- check computeInsights.ts and the stat generator above before relying on this seed.',
    )
    process.exit(1)
  }

  // ── Announcement ────────────────────────────────────────────────────────
  await supabase.from('announcements').insert({
    title: 'Intramurals 2026 is underway',
    body: 'Semi-final matches are live across all three sports. Check the brackets for schedules.',
    type: 'reminder', urgency: 'normal', audience_type: 'all', created_by: adminId,
  })

  console.log('\nDone.')
  console.log(`  3 seasons, ${TEAMS.length} teams, ${allAthletes.length} athletes, 9 events`)
  console.log(`  ${completedMatchIds.length} completed matches (double round robin), 6 LIVE at 0-0`)
  console.log(`  Trending insights: ${up} up / ${down} down`)
  console.log(`  Athlete login: <student_id>@${EMAIL_DOMAIN}  /  UrSports-<student_id>-2026!`)
  console.log(`  e.g. ${allAthletes[0].studentId}@${EMAIL_DOMAIN} / ${passwordFor(allAthletes[0].studentId)}`)
  if (wipeStaff) console.log(`  Demo staff password: ${STAFF_PASSWORD}`)
  console.log('')
}

main().catch((e) => {
  console.error('\nFAILED:', e instanceof Error ? e.message : e)
  process.exit(1)
})
