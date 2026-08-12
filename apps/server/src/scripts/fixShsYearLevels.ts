/**
 * One-time targeted fix: SHS (Senior High) only runs Grade 11/Grade 12, so no
 * SHS athlete should have year_level '3rd Year' or '4th Year'. This reassigns
 * those rows to '1st Year' / '2nd Year' alternately, and touches nothing else
 * -- no wipe, no re-seed, so scoring progress on live matches is untouched.
 *
 * Run from repo root: pnpm --filter server fix:shs-years
 */

import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url?.trim() || !key?.trim()) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/server/.env')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  const { data: rows, error } = await supabase
    .from('athletes')
    .select('id, student_id, year_level')
    .eq('department', 'SHS')
    .in('year_level', ['3rd Year', '4th Year'])
    .order('student_id')
  if (error) throw new Error(error.message)

  if (!rows || rows.length === 0) {
    console.log('No SHS athletes with 3rd/4th Year found. Nothing to do.')
    return
  }

  console.log(`Fixing ${rows.length} SHS athlete(s):`)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const newYear = i % 2 === 0 ? '1st Year' : '2nd Year'
    const { error: updErr } = await supabase
      .from('athletes')
      .update({ year_level: newYear })
      .eq('id', row.id)
    if (updErr) {
      console.log(`  ${row.student_id}  FAILED: ${updErr.message}`)
      continue
    }
    console.log(`  ${row.student_id}  ${row.year_level} -> ${newYear}`)
  }

  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
