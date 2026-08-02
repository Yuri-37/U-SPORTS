-- =============================================================================
-- 048 — Repairable standings + honest games_played
--
-- Two aggregation defects:
--
-- 1. team_season_stats was only ever INCREMENTED (wins + 1) from POST /end.
--    No recompute function existed anywhere, so a wrong W/L — from a double
--    /end or a corrected winner — could never be fixed through the app.
--
-- 2. recompute_player_season_stats counted COUNT(DISTINCT match_id) over every
--    player_game_stats row regardless of match status, so scheduled/live/
--    cancelled matches inflated games_played and season totals.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recompute_team_season_stats(p_team_id UUID, p_season_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wins   INTEGER := 0;
  v_losses INTEGER := 0;
BEGIN
  -- Derive W/L from the completed matches themselves rather than trusting a
  -- running counter. brackets.winner_id is the record of who actually won.
  SELECT
    COUNT(*) FILTER (WHERE b.winner_id = p_team_id),
    COUNT(*) FILTER (WHERE b.winner_id IS NOT NULL AND b.winner_id <> p_team_id)
  INTO v_wins, v_losses
  FROM public.matches m
  JOIN public.events e   ON e.id = m.event_id
  JOIN public.brackets b ON b.id = m.bracket_id
  WHERE e.season_id = p_season_id
    AND m.status = 'completed'
    AND (m.participant_a_id = p_team_id OR m.participant_b_id = p_team_id);

  INSERT INTO public.team_season_stats (team_id, season_id, wins, losses, updated_at)
  VALUES (p_team_id, p_season_id, v_wins, v_losses, NOW())
  ON CONFLICT (team_id, season_id) DO UPDATE SET
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_team_season_stats(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_team_season_stats(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.recompute_team_season_stats(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_team_season_stats(UUID, UUID) TO service_role;

-- Only completed matches count toward a season record.
CREATE OR REPLACE FUNCTION public.recompute_player_season_stats(
  p_athlete_id UUID,
  p_season_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
      'recompute_player_season_stats: cannot resolve sport for athlete % in season %',
      p_athlete_id, p_season_id;
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
          AND m.status = 'completed'
        GROUP BY key
      ) agg
    )
  INTO v_games_played, v_aggregated_stats
  FROM player_game_stats pgs
  JOIN matches m ON pgs.match_id = m.id
  JOIN events e ON m.event_id = e.id
  WHERE pgs.athlete_id = p_athlete_id
    AND e.season_id = p_season_id
    AND m.status = 'completed';

  INSERT INTO player_season_stats (athlete_id, season_id, sport, games_played, stats, updated_at)
  VALUES (
    p_athlete_id, p_season_id, v_sport,
    COALESCE(v_games_played, 0), COALESCE(v_aggregated_stats, '{}'::jsonb), NOW()
  )
  ON CONFLICT (athlete_id, season_id) DO UPDATE SET
    sport = EXCLUDED.sport,
    games_played = EXCLUDED.games_played,
    stats = EXCLUDED.stats,
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_player_season_stats(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_player_season_stats(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.recompute_player_season_stats(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_player_season_stats(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
