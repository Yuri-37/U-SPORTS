-- Baseline remote migration history when your database already has 001–008 applied
-- but supabase_migrations.schema_migrations is empty (so db push tries to re-run 001).
--
-- Supabase CLI versions are the numeric filename prefix only (001, 002, …), not the rest of the name.
--
-- Steps:
--   1) Supabase Dashboard → SQL Editor → run this script once, OR from repo root:
--      powershell -ExecutionPolicy Bypass -File scripts/supabase-repair-baseline.ps1
--   2) From project root: pnpm db:push
--      That should apply only: 009_add_user_role_student, 010_fix_handle_new_user, 011_student_tryout_flow.
--
-- If push still fails because objects from 009–011 already exist on the DB, mark those versions
-- applied with: npx supabase migration repair <version> --status applied

INSERT INTO supabase_migrations.schema_migrations (version)
SELECT v FROM unnest(ARRAY[
  '001',
  '002',
  '003',
  '004',
  '005',
  '006',
  '007',
  '008'
]) AS t(v)
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations s WHERE s.version = t.v
);
