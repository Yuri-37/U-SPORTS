/**
 * Read-only inventory of what's currently in the database, so a destructive
 * reset can be reviewed before it runs. Creates and changes nothing.
 *
 * Run from repo root: pnpm --filter server inspect:data
 */

import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const TABLES = [
  'institution',
  'seasons',
  'profiles',
  'organizers',
  'athletes',
  'teams',
  'team_members',
  'team_coaches',
  'events',
  'event_participants',
  'brackets',
  'matches',
  'match_scores',
  'match_period_locks',
  'scoring_actions',
  'player_game_stats',
  'player_season_stats',
  'team_season_stats',
  'insights',
  'notifications',
  'announcements',
  'push_tokens',
  'audit_logs',
]

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url?.trim() || !key?.trim()) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/server/.env')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  console.log(`\nDatabase: ${url}\n`)
  console.log('ROW COUNTS')
  console.log('----------')
  for (const t of TABLES) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true })
    if (error) {
      console.log(`  ${t.padEnd(22)} (error: ${error.message})`)
      continue
    }
    console.log(`  ${t.padEnd(22)} ${String(count ?? 0).padStart(6)}`)
  }

  console.log('\nPROFILES BY ROLE  (these are login accounts)')
  console.log('-------------------------------------------')
  const { data: profiles } = await supabase.from('profiles').select('id, email, full_name, role')
  const byRole = new Map<string, { email: string; full_name: string }[]>()
  for (const p of profiles ?? []) {
    const role = (p.role as string) ?? '(no role / athlete)'
    if (!byRole.has(role)) byRole.set(role, [])
    byRole.get(role)!.push({ email: p.email as string, full_name: p.full_name as string })
  }
  for (const [role, list] of byRole) {
    console.log(`  ${role} — ${list.length}`)
    // Staff accounts matter individually; athletes are bulk data.
    if (role !== '(no role / athlete)') {
      for (const p of list) console.log(`      ${p.full_name}  <${p.email}>`)
    }
  }

  console.log('\nSEASONS')
  console.log('-------')
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, name, status, start_date, end_date')
    .order('created_at')
  for (const s of seasons ?? []) {
    console.log(`  [${String(s.status).padEnd(9)}] ${s.name}   ${s.id}`)
  }

  console.log('\nEVENTS')
  console.log('------')
  const { data: events } = await supabase
    .from('events')
    .select('id, name, sport, status, format')
    .order('created_at')
  for (const e of events ?? []) {
    console.log(`  [${String(e.status).padEnd(12)}] ${String(e.sport).padEnd(13)} ${e.name}`)
  }

  console.log('\nTEAMS')
  console.log('-----')
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, sport, department, members:team_members(id)')
    .order('name')
  for (const t of teams ?? []) {
    const n = ((t.members as unknown[]) ?? []).length
    console.log(
      `  ${String(t.name).padEnd(30)} ${String(t.sport).padEnd(13)} ${String(t.department ?? '-').padEnd(6)} ${n} players`,
    )
  }

  console.log('\nMATCHES BY STATUS')
  console.log('-----------------')
  const { data: matches } = await supabase.from('matches').select('status')
  const statusCount = new Map<string, number>()
  for (const m of matches ?? []) {
    const s = (m.status as string) ?? 'unknown'
    statusCount.set(s, (statusCount.get(s) ?? 0) + 1)
  }
  for (const [s, n] of statusCount) console.log(`  ${s.padEnd(14)} ${n}`)

  console.log('\nINSTITUTION')
  console.log('-----------')
  const { data: inst } = await supabase.from('institution').select('name, abbreviation, tagline')
  for (const i of inst ?? []) {
    console.log(`  ${i.name} (${i.abbreviation}) — "${i.tagline ?? ''}"`)
  }

  console.log('\nAUTH USERS')
  console.log('----------')
  const { data: authList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  console.log(`  ${authList?.users?.length ?? 0} auth users total`)

  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
