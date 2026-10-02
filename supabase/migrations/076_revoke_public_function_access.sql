-- Migration 053 ran GRANT ALL ON ALL ROUTINES ... TO anon, authenticated, which
-- undid the earlier lockdowns (044/046/048) for every function that existed at
-- that point. The three SECURITY DEFINER functions below mutate match scores
-- and season statistics without any role check, so with the public anon key
-- (which ships inside the web bundle and the APK) anyone could call
--   POST /rest/v1/rpc/increment_match_score
-- and rewrite a live score. They are only ever called by the API server, which
-- uses the service role, so the browser-facing roles get no access at all.
--
-- is_admin / is_staff / can_manage_competition stay executable: RLS policies
-- evaluate them as the calling role and they only return a boolean.

REVOKE ALL ON FUNCTION public.increment_match_score(UUID, UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_player_season_stats(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_team_season_stats(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.increment_match_score(UUID, UUID, TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_player_season_stats(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_team_season_stats(UUID, UUID) TO service_role;

-- 053 also made every FUTURE function public by default. Functions created from
-- now on are private until a migration grants them deliberately.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
