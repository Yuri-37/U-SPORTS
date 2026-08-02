-- Resolve sport when athletes.sport is missing/null or SELECT returns nothing (RPC must never insert NULL sport).

CREATE OR REPLACE FUNCTION recompute_player_season_stats(
  p_athlete_id UUID,
  p_season_id UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sport TEXT;
  v_games_played INTEGER;
  v_aggregated_stats JSONB;
BEGIN
  SELECT NULLIF(btrim(a.sport::TEXT), '') INTO v_sport
  FROM athletes a
  WHERE a.id = p_athlete_id;

  IF v_sport IS NULL THEN
    SELECT NULLIF(btrim(pgs.sport::TEXT), '') INTO v_sport
    FROM player_game_stats pgs
    INNER JOIN matches m ON m.id = pgs.match_id
    INNER JOIN events e ON e.id = m.event_id
    WHERE pgs.athlete_id = p_athlete_id
      AND e.season_id = p_season_id
    ORDER BY pgs.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_sport IS NULL THEN
    RAISE EXCEPTION
      'recompute_player_season_stats: cannot resolve sport for athlete % in season % (check athletes.sport or player_game_stats for this season)',
      p_athlete_id,
      p_season_id;
  END IF;

  SELECT
    COUNT(DISTINCT pgs.match_id)::INTEGER,
    (
      SELECT jsonb_object_agg(key, sum_value)
      FROM (
        SELECT key, SUM((value::TEXT)::NUMERIC) AS sum_value
        FROM player_game_stats pgs2
        JOIN matches m ON pgs2.match_id = m.id
        JOIN events e ON m.event_id = e.id
        CROSS JOIN jsonb_each(pgs2.stats)
        WHERE pgs2.athlete_id = p_athlete_id
          AND e.season_id = p_season_id
          AND e.is_tryout = false
        GROUP BY key
      ) agg
    )
  INTO v_games_played, v_aggregated_stats
  FROM player_game_stats pgs
  JOIN matches m ON pgs.match_id = m.id
  JOIN events e ON m.event_id = e.id
  WHERE pgs.athlete_id = p_athlete_id
    AND e.season_id = p_season_id
    AND e.is_tryout = false;

  INSERT INTO player_season_stats (athlete_id, season_id, sport, games_played, stats, updated_at)
  VALUES (
    p_athlete_id,
    p_season_id,
    v_sport,
    COALESCE(v_games_played, 0),
    COALESCE(v_aggregated_stats, '{}'::jsonb),
    NOW()
  )
  ON CONFLICT (athlete_id, season_id) DO UPDATE SET
    sport = EXCLUDED.sport,
    games_played = EXCLUDED.games_played,
    stats = EXCLUDED.stats,
    updated_at = NOW();
END;
$$;

NOTIFY pgrst, 'reload schema';
