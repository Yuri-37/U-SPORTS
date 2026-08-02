-- =============================================================================
-- 046 — Representable periods + a `total` that means something for every sport
--
-- Two structural limits removed:
--   * Basketball had a single `ot` column, so 2OT/3OT collapsed into one bucket.
--   * Table tennis had game1..game5 only, so best-of-7 was impossible.
--
-- And one long-standing bug fixed: `total` was
--     GENERATED ALWAYS AS (q1 + q2 + q3 + q4 + ot) STORED
-- i.e. basketball-only, so it was permanently 0 for volleyball and table
-- tennis. Anything that ranked or picked a winner from `total` silently tied
-- at 0-0 for those sports (see MatchReview.prompt_winnerId).
--
-- `total` now sums whichever period family belongs to the row's sport.
-- =============================================================================

ALTER TABLE public.match_scores ADD COLUMN IF NOT EXISTS ot2   INTEGER DEFAULT 0;
ALTER TABLE public.match_scores ADD COLUMN IF NOT EXISTS ot3   INTEGER DEFAULT 0;
ALTER TABLE public.match_scores ADD COLUMN IF NOT EXISTS game6 INTEGER DEFAULT 0;
ALTER TABLE public.match_scores ADD COLUMN IF NOT EXISTS game7 INTEGER DEFAULT 0;

-- Generated columns cannot be altered in place; drop and re-add.
ALTER TABLE public.match_scores DROP COLUMN IF EXISTS total;

ALTER TABLE public.match_scores
  ADD COLUMN total INTEGER GENERATED ALWAYS AS (
    CASE sport
      WHEN 'basketball' THEN
        COALESCE(q1,0) + COALESCE(q2,0) + COALESCE(q3,0) + COALESCE(q4,0)
        + COALESCE(ot,0) + COALESCE(ot2,0) + COALESCE(ot3,0)
      WHEN 'volleyball' THEN
        COALESCE(set1,0) + COALESCE(set2,0) + COALESCE(set3,0)
        + COALESCE(set4,0) + COALESCE(set5,0)
      WHEN 'table-tennis' THEN
        COALESCE(game1,0) + COALESCE(game2,0) + COALESCE(game3,0) + COALESCE(game4,0)
        + COALESCE(game5,0) + COALESCE(game6,0) + COALESCE(game7,0)
      ELSE 0
    END
  ) STORED;

-- Allow the new columns through the score-increment whitelist.
CREATE OR REPLACE FUNCTION public.increment_match_score(
  p_match_id UUID,
  p_participant_id UUID,
  p_field TEXT,
  p_value NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_field NOT IN (
    'q1', 'q2', 'q3', 'q4', 'ot', 'ot2', 'ot3',
    'set1', 'set2', 'set3', 'set4', 'set5',
    'game1', 'game2', 'game3', 'game4', 'game5', 'game6', 'game7'
  ) THEN
    RAISE EXCEPTION 'increment_match_score: illegal score field %', p_field
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  EXECUTE format(
    'UPDATE match_scores SET %I = GREATEST(0, %I + $1) WHERE match_id = $2 AND participant_id = $3',
    p_field, p_field
  ) USING p_value, p_match_id, p_participant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_match_score(UUID, UUID, TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_match_score(UUID, UUID, TEXT, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.increment_match_score(UUID, UUID, TEXT, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_match_score(UUID, UUID, TEXT, NUMERIC) TO service_role;

NOTIFY pgrst, 'reload schema';
