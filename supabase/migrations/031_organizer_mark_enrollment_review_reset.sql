-- When organizers set a student back to unverified (decline / request new COR / reset),
-- enrollment_status may already be unverified so the BEFORE UPDATE trigger does not bump
-- enrollment_verification_reset_at. Expose a DEFINER RPC for the API (service role) to mark that intent.

CREATE OR REPLACE FUNCTION public.organizer_mark_enrollment_review_reset(p_profile_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET enrollment_verification_reset_at = timezone('utc', now())
  WHERE id = p_profile_id
    AND role = 'student'::public.user_role;
END;
$$;

REVOKE ALL ON FUNCTION public.organizer_mark_enrollment_review_reset(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organizer_mark_enrollment_review_reset(UUID) TO service_role;

COMMENT ON FUNCTION public.organizer_mark_enrollment_review_reset(UUID) IS
  'Sets enrollment_verification_reset_at when organizer moves student enrollment to unverified (including already-unverified declines).';

SELECT pg_notify('pgrst', 'reload schema');
