-- A real "account locked" state for athletes and Super Admins.
--
-- Until now the only "deactivate" was
--   * organizers.is_active   -- Organizers and Coaches (blocked at the API), and
--   * athletes.season_status -- "not playing this season": hides the athlete
--     from rosters but deliberately leaves their sign-in working, so a graduate
--     can still look up their history.
-- An athlete who must actually be shut out (left the school, misconduct, a
-- duplicate or fake account), and a Super Admin who should no longer have
-- access, had no switch at all.
--
-- deactivated_at lives on profiles because every account -- athlete or staff --
-- has exactly one profiles row, so the API's per-request account check (see
-- apps/server/src/middleware/auth.ts) can answer "is this person locked out?"
-- with the profile lookup it already does. NULL = normal; a timestamp = locked
-- since then. The column is only ever written by the API (service role): the
-- client-side update policy on profiles was removed in migration 068.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.deactivated_at IS
  'Set when an account is deactivated (cannot sign in, every API call is rejected); NULL while active. Distinct from athletes.season_status, which only hides an athlete from the current season.';
