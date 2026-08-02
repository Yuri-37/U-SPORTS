-- Tracks organizer-driven enrollment reset (verified → unverified) so the student app can
-- show "renew / resubmit COR" only after a revoke, not for brand-new pending students.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enrollment_verification_reset_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.enrollment_verification_reset_at IS
  'Set when enrollment moves from verified to unverified (organizer reset). Cleared when enrollment is verified again.';

-- PostgREST caches table columns; reload so API stops reporting "column ... not found in the schema cache"
SELECT pg_notify('pgrst', 'reload schema');
