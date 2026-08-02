-- Allow tryout squads: roster verified students (profiles) who are not athletes yet.
-- Either athlete_id OR student_profile_id is set, never both.

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE t.relname = 'team_members'
      AND n.nspname = 'public'
      AND c.contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.team_members
  ALTER COLUMN athlete_id DROP NOT NULL;

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS student_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_one_participant_chk;

ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_one_participant_chk CHECK (
    (athlete_id IS NOT NULL AND student_profile_id IS NULL)
    OR (athlete_id IS NULL AND student_profile_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS team_members_team_athlete_unique
  ON public.team_members (team_id, athlete_id)
  WHERE athlete_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS team_members_team_student_unique
  ON public.team_members (team_id, student_profile_id)
  WHERE student_profile_id IS NOT NULL;
