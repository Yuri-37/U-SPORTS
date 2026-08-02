-- =============================================================================
-- Nuclear dev reset: all teams + all athlete/student accounts (players).
--
-- REMOVES:
--   • Events (CASCADE: brackets, matches, scores, tryout rows tied to events, …)
--   • All teams (CASCADE: team_members, team_coaches, team_season_stats)
--   • Aggregated stats, insights, leaderboard visibility
--   • Every profile with role athlete or student and their auth.users row
--     (CASCADE: athletes, verification_documents, student_documents, …)
--
-- KEEPS:
--   • institution, sports_config
--   • seasons (empty of teams/events afterward)
--   • organizers, super_admin profiles and auth users
--   • Announcements not authored by a removed profile (others unchanged)
--
-- Run locally (single statement for Supabase CLI):
--   npx supabase db query --local -f supabase/scripts/delete_all_teams_and_players.sql --agent=no
-- =============================================================================

DO $$
BEGIN
  UPDATE public.announcements SET linked_match_id = NULL WHERE linked_match_id IS NOT NULL;

  DELETE FROM public.insights;
  DELETE FROM public.leaderboard_visibility;
  DELETE FROM public.player_season_stats;
  DELETE FROM public.team_season_stats;

  DELETE FROM public.events;
  DELETE FROM public.teams;

  DELETE FROM public.audit_logs
  WHERE actor_id IN (
    SELECT id FROM public.profiles WHERE role IN ('athlete'::public.user_role, 'student'::public.user_role)
  );

  DELETE FROM public.announcements
  WHERE created_by IN (
    SELECT id FROM public.profiles WHERE role IN ('athlete'::public.user_role, 'student'::public.user_role)
  );

  DELETE FROM auth.users
  WHERE id IN (
    SELECT id FROM public.profiles WHERE role IN ('athlete'::public.user_role, 'student'::public.user_role)
  );

  PERFORM pg_notify('pgrst', 'reload schema');
END $$;
