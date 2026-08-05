-- =============================================================================
-- Teardown for seed_mock_three_sports_leagues.sql — [MOCK] data ONLY.
--
-- Unlike clean_competition_data_keep_players.sql and
-- delete_all_teams_and_players.sql (which wipe ALL events/teams and are
-- dev-only), this script is scoped strictly to rows the mock seed created,
-- so it is safe to run against a live/production database alongside real data.
--
-- Everything it touches is matched by the seed's own naming contract:
--   • season "[MOCK] Three-sport showcase"
--   • events / teams named '[MOCK]%'
--   • accounts with email 'mock-%@<institution student_email_domain>'
--
-- REMOVES (mock only):
--   • [MOCK] events (CASCADE: brackets, matches, match_scores, scoring_actions,
--     player_game_stats, event_participants, tryout_registrations)
--   • [MOCK] teams (CASCADE: team_members, team_coaches, team_season_stats)
--   • mock- accounts in auth.users (CASCADE: profiles → athletes, notifications,
--     push_tokens, student_documents, …)
--   • the [MOCK] season (CASCADE: player_season_stats, leaderboard_visibility)
--   • insights rows pointing at mock athletes/teams (no FK — deleted explicitly)
--   • audit_logs / announcements authored by mock accounts
--
-- KEEPS: every non-[MOCK] event, team, account, season, and announcement.
--
-- Run in the Supabase SQL Editor (works against production), or locally:
--   npx supabase db query --local -f supabase/scripts/delete_mock_three_sports_leagues.sql --agent=no
--
-- Idempotent — re-running after a successful teardown is a no-op.
-- =============================================================================

DO $mockdown$
DECLARE
  mock_profile_ids UUID[];
  mock_athlete_ids UUID[];
  mock_team_ids    UUID[];
  mock_match_ids   UUID[];
BEGIN
  -- Resolve the mock object graph up front: once the parent rows are deleted
  -- these lookups would return nothing, so capture ids before any DELETE runs.
  SELECT COALESCE(array_agg(id), '{}') INTO mock_profile_ids
  FROM public.profiles WHERE email LIKE 'mock-%';

  SELECT COALESCE(array_agg(id), '{}') INTO mock_athlete_ids
  FROM public.athletes WHERE profile_id = ANY(mock_profile_ids);

  SELECT COALESCE(array_agg(id), '{}') INTO mock_team_ids
  FROM public.teams WHERE name LIKE '[MOCK]%';

  SELECT COALESCE(array_agg(m.id), '{}') INTO mock_match_ids
  FROM public.matches m
  JOIN public.events e ON e.id = m.event_id
  WHERE e.name LIKE '[MOCK]%';

  -- FK safety: announcements reference matches with ON DELETE RESTRICT-style
  -- intent elsewhere in these scripts, so clear the link before the cascade.
  UPDATE public.announcements
  SET linked_match_id = NULL
  WHERE linked_match_id = ANY(mock_match_ids);

  -- insights.entity_id is a bare UUID with no FK, so nothing cascades it.
  DELETE FROM public.insights
  WHERE (entity_type = 'player' AND entity_id = ANY(mock_athlete_ids))
     OR (entity_type = 'team'   AND entity_id = ANY(mock_team_ids));

  -- Cascades brackets, matches, match_scores, scoring_actions,
  -- player_game_stats, event_participants, tryout_registrations.
  DELETE FROM public.events WHERE name LIKE '[MOCK]%';

  -- Cascades team_members, team_coaches, team_season_stats.
  DELETE FROM public.teams WHERE name LIKE '[MOCK]%';

  DELETE FROM public.audit_logs      WHERE actor_id   = ANY(mock_profile_ids);
  DELETE FROM public.announcements   WHERE created_by = ANY(mock_profile_ids);

  -- Cascades profiles → athletes, notifications, push_tokens, student_documents.
  DELETE FROM auth.users WHERE id = ANY(mock_profile_ids);

  -- Last: cascades any remaining player_season_stats / leaderboard_visibility.
  DELETE FROM public.seasons WHERE name = '[MOCK] Three-sport showcase';

  RAISE NOTICE 'Mock teardown complete — % accounts, % teams, % matches removed.',
    COALESCE(array_length(mock_profile_ids, 1), 0),
    COALESCE(array_length(mock_team_ids, 1), 0),
    COALESCE(array_length(mock_match_ids, 1), 0);

  PERFORM pg_notify('pgrst', 'reload schema');
END $mockdown$;
