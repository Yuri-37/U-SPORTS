-- Distinguishes tryout squads (verified students) vs official rosters (approved athletes).

DO $$ BEGIN
  CREATE TYPE public.team_roster_context AS ENUM ('tryout', 'official');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS roster_context public.team_roster_context NOT NULL DEFAULT 'official';

COMMENT ON COLUMN public.teams.roster_context IS
  'tryout = student-based tryout lineup; official = approved athlete roster for competition.';

SELECT pg_notify('pgrst', 'reload schema');
