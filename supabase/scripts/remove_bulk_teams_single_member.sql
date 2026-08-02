-- =============================================================================
-- Delete teams in "[BULK] Demo season" that have exactly one roster row.
-- Cascades team_members (and other team FKs with ON DELETE CASCADE).
--
--   npx supabase db query --local -f supabase/scripts/remove_bulk_teams_single_member.sql --agent=no
--
-- To target every season, replace the season filter with TRUE (see comment inside).
-- =============================================================================

DO $$
DECLARE
  bulk_season uuid;
BEGIN
  SELECT s.id INTO bulk_season FROM public.seasons s WHERE s.name = '[BULK] Demo season' LIMIT 1;

  IF bulk_season IS NULL THEN
    RAISE NOTICE '[BULK] Demo season not found; nothing deleted.';
    RETURN;
  END IF;

  -- Optional: remove season filter and use "WHERE TRUE" in both statements to wipe all lone-member teams.
  UPDATE public.teams t
  SET captain_id = NULL
  WHERE t.season_id = bulk_season
    AND t.id IN (
      SELECT tm.team_id
      FROM public.team_members tm
      JOIN public.teams tt ON tt.id = tm.team_id AND tt.season_id = bulk_season
      GROUP BY tm.team_id
      HAVING COUNT(*) = 1
    );

  DELETE FROM public.teams t
  WHERE t.season_id = bulk_season
    AND t.id IN (
      SELECT tm.team_id
      FROM public.team_members tm
      JOIN public.teams tt ON tt.id = tm.team_id AND tt.season_id = bulk_season
      GROUP BY tm.team_id
      HAVING COUNT(*) = 1
    );

  RAISE NOTICE 'Removed bulk-demo teams with exactly one roster member.';
END $$;
