-- Sync enrollment_verification_reset_at inside Postgres so API patches only enrollment_status.
-- PostgREST rejects unknown columns in PATCH bodies when its schema cache does not list them yet.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enrollment_verification_reset_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.profiles_sync_enrollment_verification_reset_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.enrollment_status IS DISTINCT FROM NEW.enrollment_status THEN
    IF OLD.enrollment_status = 'verified' AND NEW.enrollment_status = 'unverified' THEN
      NEW.enrollment_verification_reset_at := timezone('utc', now());
    ELSIF NEW.enrollment_status = 'verified' THEN
      NEW.enrollment_verification_reset_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_enrollment_verification_reset_at ON public.profiles;
CREATE TRIGGER trg_profiles_sync_enrollment_verification_reset_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_sync_enrollment_verification_reset_at();

COMMENT ON FUNCTION public.profiles_sync_enrollment_verification_reset_at IS
  'Sets enrollment_verification_reset_at on verified→unverified; clears it when enrollment becomes verified.';

SELECT pg_notify('pgrst', 'reload schema');
