/**
 * One-off remediation: give a fresh, keyed first password to every athlete
 * still on the old public `UrSports-<student_id>-2026!` formula who has never
 * changed it. Until they were reissued, those accounts could be signed into
 * by anyone, because the formula was in the public repo and student IDs are
 * effectively public.
 *
 * Targets exactly: athletes whose account has never had a self-service
 * password change (profiles.password_changed_at IS NULL) and was not already
 * issued under the keyed scheme (issued_password_scheme <> 'keyed-v1'). An
 * athlete who has changed their password is left alone -- their password is
 * their own and unknown to us. Re-running is safe: reissued accounts get the
 * scheme stamp and drop out of the target set.
 *
 * Prints a CSV (full name, student ID, email, new password) for staff to
 * hand out, since invite emails are disabled. Nothing here emails anyone.
 *
 *   # See who would change and preview the credentials, no writes:
 *   npx tsx apps/server/src/scripts/reissueFirstPasswords.ts
 *   # Actually set the passwords:
 *   npx tsx apps/server/src/scripts/reissueFirstPasswords.ts --apply
 *
 * Loads apps/server/.env by absolute path (the live database). The password
 * generator keys off SUPABASE_SERVICE_ROLE_KEY / ACCOUNT_PASSWORD_SECRET from
 * that same file, so the printed passwords match what the app will accept.
 */
import { config } from 'dotenv'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { firstPassword, ISSUED_PASSWORD_SCHEME } from '../utils/readablePassword'

config({ path: join(__dirname, '../../.env') })

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error(
    `Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in ${join(__dirname, '../../.env')}`,
  )
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const supabase = createClient(url, serviceKey)

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

async function main() {
  console.log(`\nTarget database: ${url}`)
  console.log(
    APPLY
      ? 'MODE: APPLY -- passwords will be changed.\n'
      : 'MODE: dry run -- no writes. Pass --apply to change passwords.\n',
  )

  // Athletes carry student_id; join their profile for the reissue conditions
  // and the contact details the CSV needs.
  const { data: rows, error } = await supabase
    .from('athletes')
    .select(
      'id, student_id, profile:profiles!athletes_profile_id_fkey(id, full_name, email, password_changed_at, issued_password_scheme)',
    )
    .order('student_id')
  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }

  type Row = {
    student_id: string
    profile: {
      id: string
      full_name: string | null
      email: string | null
      password_changed_at: string | null
      issued_password_scheme: string | null
    } | null
  }

  const targets = (rows as unknown as Row[]).filter((r) => {
    const p = r.profile
    return (
      p && p.password_changed_at === null && p.issued_password_scheme !== ISSUED_PASSWORD_SCHEME
    )
  })

  const total = (rows ?? []).length
  console.log(
    `${total} athletes total; ${targets.length} still on a never-changed pre-scheme password.\n`,
  )
  if (targets.length === 0) {
    console.log('Nothing to reissue.')
    return
  }

  console.log('full_name,student_id,email,new_password')
  let changed = 0
  let failed = 0
  for (const r of targets) {
    const p = r.profile!
    const password = firstPassword(r.student_id)
    console.log(
      [p.full_name ?? '', r.student_id, p.email ?? '', password]
        .map((c) => csvCell(String(c)))
        .join(','),
    )
    if (!APPLY) continue

    const { error: pwErr } = await supabase.auth.admin.updateUserById(p.id, { password })
    if (pwErr) {
      console.error(`  # FAILED to set password for ${r.student_id}: ${pwErr.message}`)
      failed++
      continue
    }
    const { error: schemeErr } = await supabase
      .from('profiles')
      .update({ issued_password_scheme: ISSUED_PASSWORD_SCHEME })
      .eq('id', p.id)
    if (schemeErr) {
      console.error(
        `  # password set but scheme stamp failed for ${r.student_id}: ${schemeErr.message}`,
      )
    }
    changed++
  }

  if (APPLY) {
    console.log(`\nDone. ${changed} reissued, ${failed} failed.`)
    console.log(
      'Distribute the CSV above to each athlete; they should change it after first sign-in.',
    )
  } else {
    console.log(`\nDry run only. Re-run with --apply to set these ${targets.length} passwords.`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
