-- =============================================================================
-- 050 — Persist "finalized" state on matches (Match Score Sheet feature)
--
-- POST /scoring/:matchId/finalize previously wrote nothing queryable to the
-- matches row (only an audit_logs entry + a component-local React flag), so
-- no later page load, or any other endpoint, could tell whether a given
-- match had ever been finalized. This blocks all three Match Score Sheet
-- entry points (Post-Game Review's persistent "View Score Sheet" action, the
-- EventDetail matches-tab link, and the Analytics "Score Sheets" tab list),
-- since all three need to query "is this match finalized" across many
-- matches, not just react to an in-session event.
-- =============================================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ NULL;

-- Backs "list finalized matches for a season+sport" (WHERE finalized_at IS NOT NULL).
CREATE INDEX IF NOT EXISTS idx_matches_finalized_at
  ON public.matches (finalized_at)
  WHERE finalized_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
