-- Found by an outside tester: profiles_select_all (migration 002/037) lets
-- ANYONE -- no login at all, just the public anon key every browser already
-- has -- list every row in profiles directly from Supabase's REST API,
-- bypassing the app entirely. Migration 074 hid the email COLUMN from anon,
-- but every other column, including every STAFF member's full_name, role and
-- department, stayed fully readable with no row restriction:
--
--   GET /rest/v1/profiles?select=id,full_name,role&role=eq.Admin
--   -> 200, lists every Super Admin's name with no session at all.
--
-- The only legitimate reason a signed-out visitor needs to read `profiles`
-- at all is to show an athlete's name on a public page (team roster, guest
-- leaderboard, event results) -- and even that only for an athlete the app
-- already shows publicly (athletes_select_visible: active, or the person's
-- own row, or staff). This policy is narrowed to exactly that reach: an
-- active athlete's profile, your own profile, or -- for staff, who need the
-- full directory for rosters, audit logs and assignment tools -- everyone.
--
-- Nothing currently-working should change: every guest page that reads a
-- profile does so by joining through `athletes`, which already required
-- season_status = 'active' to be visible at all.

DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;

CREATE POLICY "profiles_select_scoped" ON public.profiles FOR SELECT
USING (
  id = auth.uid()
  OR is_staff()
  OR EXISTS (
    SELECT 1 FROM public.athletes a
    WHERE a.profile_id = profiles.id
      AND a.season_status = 'active'
  )
);
