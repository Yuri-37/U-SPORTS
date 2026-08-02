-- Migration 042: Replace the dropped athletes_select_visible policy.
-- Migration 040 removed the policy because it referenced the now-dropped
-- verification_status column. This migration adds the replacement that uses
-- season_status instead.

-- The write policy from migration 037 is still intact; only the SELECT
-- policy needs to be restored.

DROP POLICY IF EXISTS "athletes_select_visible" ON public.athletes;

CREATE POLICY "athletes_select_visible" ON public.athletes FOR SELECT USING (
  season_status = 'active'
  OR profile_id = auth.uid()
  OR public.is_staff()
);

NOTIFY pgrst, 'reload schema';
