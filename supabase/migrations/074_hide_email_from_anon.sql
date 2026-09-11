-- Stop unauthenticated (anon) callers from reading email addresses.
--
-- profiles has RLS "profiles_select_all USING (TRUE)", and migration 053
-- granted anon table-wide SELECT, so anyone holding the public anon key --
-- which ships in the web bundle and every APK -- could read every account's
-- email straight from PostgREST without signing in. Combined with the old
-- guessable password formula, an email plus a student ID was a full account
-- takeover; the formula is fixed separately (readablePassword.ts), and this
-- closes the bulk email harvest.
--
-- RLS is row-level and cannot hide a single column, so this uses column
-- privileges: drop anon's table-wide SELECT and grant back every column
-- except email. authenticated and service_role are untouched -- signed-in
-- users and the API server still read email as before.
--
-- Verified before writing: no anon/guest path (web guest pages, or the
-- shipped mobile app's logged-out screens) selects profiles.email. They embed
-- profiles as (full_name, avatar_url) only. So this breaks no current client,
-- including already-installed apps. New columns are intentionally NOT granted
-- to anon by this list -- anon stays least-privilege, and a future column a
-- guest page needs must be added here deliberately.
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id,
  role,
  full_name,
  avatar_url,
  created_at,
  updated_at,
  department,
  password_changed_at,
  privacy_accepted_at,
  tours_completed
) ON public.profiles TO anon;

-- NOTE: athletes.student_id is deliberately still readable by anon. The
-- shipped mobile app's guest leaderboard and athlete-profile screens select
-- athletes.* (and the web guest leaderboard selected student_id explicitly,
-- removed in this change), so revoking it at the database would break the
-- already-installed app. Student IDs are semi-public (ID cards, class lists)
-- and, with the password formula fixed, no longer grant account access.
-- Revisit once a mobile release that stops selecting student_id has rolled out.

NOTIFY pgrst, 'reload schema';
