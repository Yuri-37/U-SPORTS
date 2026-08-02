-- 040: Remove the athlete review / medical-clearance system.
-- Athletes are now simply Active / Inactive (athletes.season_status). All
-- verification + medical-clearance gating is removed. Also adds a scoreboard
-- snapshot column to scoring_actions for the live-scoring audit trail (Phase 5).

-- 1. Drop the verification documents table (med certs / COR uploads).
DROP TABLE IF EXISTS public.verification_documents CASCADE;

-- 2. Drop the medical-clearance revocation helper (depends on the column below).
DROP FUNCTION IF EXISTS public.organizer_mark_medical_clearance_revoked(UUID);

-- 3. Drop policies that reference the columns being removed.
DROP POLICY IF EXISTS athletes_select_visible ON public.athletes;
DROP POLICY IF EXISTS athletes_update_own ON public.athletes;

-- 4. Drop review / clearance columns from athletes (keep season_status).
ALTER TABLE public.athletes
  DROP COLUMN IF EXISTS verification_status,
  DROP COLUMN IF EXISTS reviewer_id,
  DROP COLUMN IF EXISTS review_notes,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS medical_cleared,
  DROP COLUMN IF EXISTS medical_clearance_revoked_at;

-- 5. Drop the now-unused enum type (only athletes.verification_status used it).
DROP TYPE IF EXISTS verification_status;

-- 6. Live-scoring audit: store a scoreboard snapshot with each recorded action
--    (game/quarter number is already quarter_or_set; player is athlete_id;
--     stat category is action_type). Nullable so existing rows are unaffected.
ALTER TABLE public.scoring_actions
  ADD COLUMN IF NOT EXISTS score_after JSONB;

NOTIFY pgrst, 'reload schema';
