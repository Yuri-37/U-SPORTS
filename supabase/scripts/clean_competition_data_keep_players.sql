-- Clean competition / standings data while KEEPING people (profiles; run separately if you need to trim auth.users),
-- athlete rows, student_documents, and seasons as configured below.
--
-- Run in Supabase SQL Editor (or psql) when you want a fresh testing slate.
--
-- REMOVES:
--   • All events (CASCADE: brackets, matches, match_scores, scoring_actions, player_game_stats,
--     event_participants, tryout_registrations tied to those events)
--   • All teams (CASCADE: team_members, team_coaches, team_season_stats)
--   • Aggregated season stats rows, leaderboard visibility, insights
--
-- KEEPS:
--   • profiles, athletes, organizers, seasons, institution, student_documents
--
-- BEFORE deleting matches/events: clear announcement links (FK safety).
UPDATE public.announcements SET linked_match_id = NULL WHERE linked_match_id IS NOT NULL;

DELETE FROM public.insights;
DELETE FROM public.leaderboard_visibility;
DELETE FROM public.player_season_stats;
DELETE FROM public.team_season_stats;

DELETE FROM public.events;
DELETE FROM public.teams;

-- Optional: reload PostgREST schema cache
-- SELECT pg_notify('pgrst', 'reload schema');
