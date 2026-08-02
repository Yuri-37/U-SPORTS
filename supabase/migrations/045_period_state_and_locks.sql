-- =============================================================================
-- 045 — Server-owned period state + per-period locking
--
-- Problem 1 ("toggle sets"): the current quarter/set/game lived only in React
-- state (Scoring.tsx `useState(1)`). A page refresh silently reset it to 1 and
-- subsequent points were written into the wrong period column. Spectator views
-- had to reverse-engineer the period from the last scoring_actions row.
--
-- Problem 2 ("lock the sets after validation"): nothing marked a period as
-- finished, so a scorer could jump back to set 1 after set 3 and keep scoring.
--
-- matches.current_period becomes the single source of truth, and a validated
-- period is frozen by a row in match_period_locks.
-- =============================================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS current_period SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_current_period_chk;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_current_period_chk CHECK (current_period BETWEEN 1 AND 7);

CREATE TABLE IF NOT EXISTS public.match_period_locks (
  match_id   UUID    NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  period     SMALLINT NOT NULL CHECK (period BETWEEN 1 AND 7),
  -- Frozen scores at the moment of validation, so a later edit is detectable.
  score_a    INTEGER NOT NULL DEFAULT 0,
  score_b    INTEGER NOT NULL DEFAULT 0,
  locked_by  UUID    REFERENCES public.profiles(id),
  locked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, period)
);

CREATE INDEX IF NOT EXISTS idx_match_period_locks_match
  ON public.match_period_locks (match_id);

ALTER TABLE public.match_period_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_period_locks_select_all" ON public.match_period_locks;
CREATE POLICY "match_period_locks_select_all"
  ON public.match_period_locks FOR SELECT USING (TRUE);

-- Writes go through the API (service role). This policy only governs direct
-- browser access, which should never create or remove a lock.
DROP POLICY IF EXISTS "match_period_locks_write_competition" ON public.match_period_locks;
CREATE POLICY "match_period_locks_write_competition"
  ON public.match_period_locks FOR ALL
  USING (public.can_manage_competition())
  WITH CHECK (public.can_manage_competition());

-- Jumbotron / Hub read current_period live instead of polling scoring_actions.
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_period_locks;

NOTIFY pgrst, 'reload schema';
