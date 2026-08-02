-- Single jsonb argument avoids PostgREST multi-arg / schema-cache mismatches
-- ("Could not find the function ... (p_context, p_team_id) in the schema cache").

DROP FUNCTION IF EXISTS public.organizer_set_team_roster_context(uuid, text);

CREATE OR REPLACE FUNCTION public.organizer_set_team_roster_context(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid uuid;
  ctx text;
BEGIN
  IF payload IS NULL THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;
  tid := (payload->>'team_id')::uuid;
  ctx := payload->>'context';
  IF ctx IS NULL OR btrim(ctx) = '' THEN
    RAISE EXCEPTION 'Invalid roster context';
  END IF;
  IF ctx NOT IN ('tryout', 'official') THEN
    RAISE EXCEPTION 'Invalid roster context';
  END IF;
  UPDATE public.teams
  SET roster_context = ctx::public.team_roster_context
  WHERE id = tid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.organizer_set_team_roster_context(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organizer_set_team_roster_context(jsonb) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
