-- Track organizer-driven medical clearance revocation so athletes see "renew / resubmit" copy
-- (distinct from never having been cleared).

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS medical_clearance_revoked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.athletes.medical_clearance_revoked_at IS
  'Set when medical_cleared moves true→false; cleared when clearance is granted again.';

CREATE OR REPLACE FUNCTION public.athletes_sync_medical_clearance_revoked_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.medical_cleared IS DISTINCT FROM NEW.medical_cleared THEN
    IF OLD.medical_cleared = true AND NEW.medical_cleared = false THEN
      NEW.medical_clearance_revoked_at := timezone('utc', now());
    ELSIF NEW.medical_cleared = true THEN
      NEW.medical_clearance_revoked_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_athletes_medical_clearance_revoked_at ON public.athletes;
CREATE TRIGGER trg_athletes_medical_clearance_revoked_at
  BEFORE UPDATE ON public.athletes
  FOR EACH ROW
  EXECUTE FUNCTION public.athletes_sync_medical_clearance_revoked_at();

-- Organizer marks clearance false while already false (e.g. decline certificate): bump marker from API.
CREATE OR REPLACE FUNCTION public.organizer_mark_medical_clearance_revoked(p_athlete_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.athletes
  SET medical_clearance_revoked_at = timezone('utc', now())
  WHERE id = p_athlete_id;
END;
$$;

REVOKE ALL ON FUNCTION public.organizer_mark_medical_clearance_revoked(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organizer_mark_medical_clearance_revoked(UUID) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
