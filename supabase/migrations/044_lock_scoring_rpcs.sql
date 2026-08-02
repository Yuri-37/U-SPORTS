-- =============================================================================
-- 044 — Lock down the scoring RPCs
--
-- Both functions are SECURITY DEFINER (they bypass RLS) and were granted to
-- PUBLIC by default, which includes `anon`. Because the anon key ships in the
-- web bundle and PostgREST exposes the `public` schema, ANY unauthenticated
-- visitor could POST to /rest/v1/rpc/increment_match_score and rewrite any
-- match's score.
--
-- Both are only ever called from the Express API (apps/server/src/routes/
-- scoring.ts and admin.ts), which connects with the service-role key, so
-- revoking anon/authenticated does not affect the application.
--
-- increment_match_score also interpolated an arbitrary identifier into the
-- UPDATE. `format(%I)` prevents SQL injection, but nothing stopped a caller
-- from targeting an unintended column. It now validates against a whitelist.
-- =============================================================================

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
  -- Only the per-period score columns may be incremented. `sets_won`,
  -- `games_won` and `total` are derived and must never be written here.
  IF p_field NOT IN (
    'q1', 'q2', 'q3', 'q4', 'ot',
    'set1', 'set2', 'set3', 'set4', 'set5',
    'game1', 'game2', 'game3', 'game4', 'game5'
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

-- Revoke the implicit PUBLIC grant that comes with CREATE FUNCTION, then grant
-- back only to service_role (the key the API uses).
REVOKE ALL ON FUNCTION public.increment_match_score(UUID, UUID, TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_match_score(UUID, UUID, TEXT, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.increment_match_score(UUID, UUID, TEXT, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_match_score(UUID, UUID, TEXT, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION public.recompute_player_season_stats(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_player_season_stats(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.recompute_player_season_stats(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_player_season_stats(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
