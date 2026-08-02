-- Migration 022: standings fixes, announcement display_mode, tryout RPC exclusion

-- 1. Exclude tryout events from player season stat aggregation
CREATE OR REPLACE FUNCTION recompute_player_season_stats(
  p_athlete_id UUID,
  p_season_id UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sport TEXT;
  v_games_played INTEGER;
  v_aggregated_stats JSONB;
BEGIN
  SELECT sport INTO v_sport FROM athletes WHERE id = p_athlete_id;

  SELECT
    COUNT(DISTINCT pgs.match_id),
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
  VALUES (p_athlete_id, p_season_id, v_sport, COALESCE(v_games_played, 0), COALESCE(v_aggregated_stats, '{}'), NOW())
  ON CONFLICT (athlete_id, season_id) DO UPDATE SET
    games_played = EXCLUDED.games_played,
    stats = EXCLUDED.stats,
    updated_at = NOW();
END;
$$;

-- 2. Add display_mode to announcements
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS display_mode TEXT NOT NULL DEFAULT 'notification_only'
    CHECK (display_mode IN ('banner', 'notification_only'));

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
