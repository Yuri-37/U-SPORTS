# Mark migrations 001–008 as already applied on the LINKED remote database
# so `pnpm db:push` only runs 009_add_user_role_student, 010_fix_handle_new_user, 011_student_tryout_flow.
#
# Prerequisites: npx supabase link (project ref + DB password), logged in if prompted.
# Usage (from repo root): powershell -ExecutionPolicy Bypass -File scripts/supabase-repair-baseline.ps1

$ErrorActionPreference = 'Stop'

$versions = @(
  '001',
  '002',
  '003',
  '004',
  '005',
  '006',
  '007',
  '008'
)

foreach ($v in $versions) {
  Write-Host "Repairing (mark applied): $v"
  npx supabase migration repair $v --status applied
}

Write-Host "Done. Run: pnpm db:push"
