-- Updates teams.roster_context inside Postgres so the API can avoid sending roster_context
-- through PostgREST table PATCH/INSERT bodies (avoids "schema cache" errors when reload does not stick).

CREATE OR REPLACE FUNCTION public.organizer_set_team_roster_context(p_team_id uuid, p_context text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_context IS NULL OR btrim(p_context) = '' THEN
    RAISE EXCEPTION 'Invalid roster context';
  END IF;
  IF p_context NOT IN ('tryout', 'official') THEN
    RAISE EXCEPTION 'Invalid roster context';
  END IF;
  UPDATE public.teams
  SET roster_context = p_context::public.team_roster_context
  WHERE id = p_team_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.organizer_set_team_roster_context(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organizer_set_team_roster_context(uuid, text) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
