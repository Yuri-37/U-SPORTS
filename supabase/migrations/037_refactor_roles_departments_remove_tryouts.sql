-- Structural cleanup for panel revisions:
-- - Remove old student/tryout enrollment workflow.
-- - Replace legacy profile roles with staff roles: Admin, Organizer, Coach.
-- - Enforce profile department values: SBMA, SECA, SASE, SHS.
-- - Remove institution email-domain requirements.

BEGIN;

-- Drop policies that reference legacy role labels before changing the enum.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'institution',
        'sports_config',
        'profiles',
        'organizers',
        'athletes',
        'verification_documents',
        'seasons',
        'teams',
        'team_members',
        'team_coaches',
        'events',
        'event_participants',
        'brackets',
        'matches',
        'match_scores',
        'scoring_actions',
        'player_game_stats',
        'player_season_stats',
        'team_season_stats',
        'leaderboard_visibility',
        'insights',
        'announcements',
        'notifications',
        'audit_logs',
        'student_documents',
        'tryout_registrations'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "verification_documents_select" ON storage.objects;
DROP POLICY IF EXISTS "verification_documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "verification_documents_update" ON storage.objects;
DROP POLICY IF EXISTS "verification_documents_delete" ON storage.objects;
DROP POLICY IF EXISTS "institution_assets_public_read" ON storage.objects;
DROP POLICY IF EXISTS "institution_assets_staff_insert" ON storage.objects;
DROP POLICY IF EXISTS "institution_assets_staff_update" ON storage.objects;
DROP POLICY IF EXISTS "institution_assets_staff_delete" ON storage.objects;

-- Remove tryout-specific RPCs/triggers first.
DROP FUNCTION IF EXISTS public.organizer_set_team_roster_context(jsonb);
DROP FUNCTION IF EXISTS public.organizer_set_team_roster_context(uuid, text);
DROP FUNCTION IF EXISTS public.organizer_mark_enrollment_review_reset(uuid);
DROP TRIGGER IF EXISTS trg_profiles_sync_enrollment_verification_reset_at ON public.profiles;
DROP FUNCTION IF EXISTS public.profiles_sync_enrollment_verification_reset_at();

-- Remove tryout data and schema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'is_tryout'
  ) THEN
    DELETE FROM public.events WHERE is_tryout IS TRUE;
  END IF;
END $$;

DROP TABLE IF EXISTS public.tryout_registrations CASCADE;
DROP TABLE IF EXISTS public.student_documents CASCADE;

ALTER TABLE public.events
  DROP COLUMN IF EXISTS is_tryout;

DROP INDEX IF EXISTS public.team_members_team_student_unique;
DROP INDEX IF EXISTS public.team_members_team_athlete_unique;
ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_one_participant_chk,
  DROP COLUMN IF EXISTS student_profile_id;
DELETE FROM public.team_members WHERE athlete_id IS NULL;
ALTER TABLE public.team_members
  ALTER COLUMN athlete_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS team_members_team_athlete_unique
  ON public.team_members (team_id, athlete_id);

ALTER TABLE public.teams
  DROP COLUMN IF EXISTS roster_context;
DROP TYPE IF EXISTS public.team_roster_context;

DROP TYPE IF EXISTS public.tryout_registration_status;

DROP INDEX IF EXISTS public.idx_profiles_student_id;
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS enrollment_status,
  DROP COLUMN IF EXISTS enrollment_verification_reset_at,
  DROP COLUMN IF EXISTS student_id,
  DROP COLUMN IF EXISTS year_level;
DROP TYPE IF EXISTS public.enrollment_status;

-- Remove separate email-domain setup requirements.
ALTER TABLE public.institution
  DROP COLUMN IF EXISTS staff_email_domain,
  DROP COLUMN IF EXISTS student_email_domain;

-- Department enum for profiles/staff.
DO $$
BEGIN
  CREATE TYPE public.department AS ENUM ('SBMA', 'SECA', 'SASE', 'SHS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'department'
  ) THEN
    ALTER TABLE public.profiles
      ALTER COLUMN department DROP DEFAULT,
      ALTER COLUMN department TYPE public.department
      USING (
        CASE
          WHEN upper(nullif(btrim(department::text), '')) IN ('SBMA', 'SECA', 'SASE', 'SHS')
            THEN upper(nullif(btrim(department::text), ''))::public.department
          ELSE NULL
        END
      );
  ELSE
    ALTER TABLE public.profiles
      ADD COLUMN department public.department;
  END IF;
END $$;

-- Replace legacy user_role enum. Athlete access is now represented by public.athletes rows,
-- while profiles.role is reserved for staff/admin permissions.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

ALTER TABLE public.profiles
  ALTER COLUMN role DROP DEFAULT,
  ALTER COLUMN role DROP NOT NULL,
  ALTER COLUMN role TYPE text USING role::text;

DROP TYPE IF EXISTS public.user_role;
CREATE TYPE public.user_role AS ENUM ('Admin', 'Organizer', 'Coach');

ALTER TABLE public.profiles
  ALTER COLUMN role TYPE public.user_role
  USING (
    CASE role
      WHEN 'super_admin' THEN 'Admin'::public.user_role
      WHEN 'organizer' THEN 'Organizer'::public.user_role
      ELSE NULL
    END
  );

UPDATE auth.users
SET raw_app_meta_data =
  CASE raw_app_meta_data->>'role'
    WHEN 'super_admin' THEN jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{role}', '"Admin"', true)
    WHEN 'organizer' THEN jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{role}', '"Organizer"', true)
    WHEN 'athlete' THEN coalesce(raw_app_meta_data, '{}'::jsonb) - 'role'
    WHEN 'student' THEN coalesce(raw_app_meta_data, '{}'::jsonb) - 'role'
    ELSE coalesce(raw_app_meta_data, '{}'::jsonb)
  END;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NULL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'Admin'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('Admin'::public.user_role, 'Organizer'::public.user_role, 'Coach'::public.user_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_competition()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('Admin'::public.user_role, 'Organizer'::public.user_role)
  );
$$;

-- Recreate RLS policies using the new role model.
CREATE POLICY "institution_read_all" ON public.institution FOR SELECT USING (TRUE);
CREATE POLICY "institution_write_admin" ON public.institution FOR ALL USING (public.is_admin());

CREATE POLICY "sports_config_read_all" ON public.sports_config FOR SELECT USING (TRUE);
CREATE POLICY "sports_config_write_admin" ON public.sports_config FOR ALL USING (public.is_admin());

CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_write_admin" ON public.profiles FOR ALL USING (public.is_admin());

CREATE POLICY "organizers_select_auth" ON public.organizers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "organizers_write_admin" ON public.organizers FOR ALL USING (public.is_admin());

CREATE POLICY "athletes_select_visible" ON public.athletes FOR SELECT USING (
  verification_status = 'approved'
  OR profile_id = auth.uid()
  OR public.is_staff()
);
CREATE POLICY "athletes_write_staff" ON public.athletes FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "vdocs_select" ON public.verification_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = athlete_id AND a.profile_id = auth.uid())
  OR public.is_staff()
);
CREATE POLICY "vdocs_insert_athlete" ON public.verification_documents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = athlete_id AND a.profile_id = auth.uid())
);
CREATE POLICY "vdocs_delete_own_athlete" ON public.verification_documents FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = athlete_id AND a.profile_id = auth.uid())
  OR public.is_staff()
);

CREATE POLICY "seasons_select_all" ON public.seasons FOR SELECT USING (TRUE);
CREATE POLICY "seasons_write_admin" ON public.seasons FOR ALL USING (public.is_admin());

CREATE POLICY "teams_select_all" ON public.teams FOR SELECT USING (TRUE);
CREATE POLICY "teams_write_competition" ON public.teams FOR ALL USING (public.can_manage_competition());

CREATE POLICY "team_members_select_all" ON public.team_members FOR SELECT USING (TRUE);
CREATE POLICY "team_members_write_staff" ON public.team_members FOR ALL USING (public.is_staff());

CREATE POLICY "team_coaches_select_all" ON public.team_coaches FOR SELECT USING (TRUE);
CREATE POLICY "team_coaches_write_staff" ON public.team_coaches FOR ALL USING (public.is_staff());

CREATE POLICY "events_select_all" ON public.events FOR SELECT USING (TRUE);
CREATE POLICY "events_write_competition" ON public.events FOR ALL USING (public.can_manage_competition());

CREATE POLICY "event_participants_select_all" ON public.event_participants FOR SELECT USING (TRUE);
CREATE POLICY "event_participants_write_competition" ON public.event_participants FOR ALL USING (public.can_manage_competition());

CREATE POLICY "brackets_select_all" ON public.brackets FOR SELECT USING (TRUE);
CREATE POLICY "brackets_write_competition" ON public.brackets FOR ALL USING (public.can_manage_competition());

CREATE POLICY "matches_select_all" ON public.matches FOR SELECT USING (TRUE);
CREATE POLICY "matches_write_competition" ON public.matches FOR ALL USING (public.can_manage_competition());

CREATE POLICY "match_scores_select_all" ON public.match_scores FOR SELECT USING (TRUE);
CREATE POLICY "match_scores_write_competition" ON public.match_scores FOR ALL USING (public.can_manage_competition());

CREATE POLICY "scoring_actions_select_live_public" ON public.scoring_actions
  FOR SELECT USING (
    public.is_staff()
    OR EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = scoring_actions.match_id
        AND m.status = 'live'
    )
  );
CREATE POLICY "scoring_actions_write_competition" ON public.scoring_actions FOR ALL USING (public.can_manage_competition());

CREATE POLICY "player_game_stats_select_all" ON public.player_game_stats FOR SELECT USING (TRUE);
CREATE POLICY "player_game_stats_write_competition" ON public.player_game_stats FOR ALL USING (public.can_manage_competition());

CREATE POLICY "player_season_stats_select_all" ON public.player_season_stats FOR SELECT USING (TRUE);
CREATE POLICY "player_season_stats_write_competition" ON public.player_season_stats FOR ALL USING (public.can_manage_competition());

CREATE POLICY "team_season_stats_select_all" ON public.team_season_stats FOR SELECT USING (TRUE);
CREATE POLICY "team_season_stats_write_competition" ON public.team_season_stats FOR ALL USING (public.can_manage_competition());

CREATE POLICY "leaderboard_visibility_select_all" ON public.leaderboard_visibility FOR SELECT USING (TRUE);
CREATE POLICY "leaderboard_visibility_write_competition" ON public.leaderboard_visibility FOR ALL USING (public.can_manage_competition());

CREATE POLICY "insights_select_all" ON public.insights FOR SELECT USING (TRUE);
CREATE POLICY "insights_write_competition" ON public.insights FOR ALL USING (public.can_manage_competition());

CREATE POLICY "announcements_select_public" ON public.announcements FOR SELECT USING (
  is_public = TRUE OR auth.uid() IS NOT NULL
);
CREATE POLICY "announcements_write_staff" ON public.announcements FOR ALL USING (public.is_staff());

CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE USING (recipient_id = auth.uid());
CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE USING (recipient_id = auth.uid());
CREATE POLICY "notifications_insert_staff" ON public.notifications FOR INSERT WITH CHECK (public.is_staff());

CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT USING (
  actor_id = auth.uid() OR public.is_admin()
);
CREATE POLICY "audit_logs_insert_staff" ON public.audit_logs FOR INSERT WITH CHECK (public.is_staff());

CREATE POLICY "verification_documents_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_staff()
    )
  );

CREATE POLICY "verification_documents_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "verification_documents_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "verification_documents_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_staff()
    )
  );

CREATE POLICY "institution_assets_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'institution-assets');

CREATE POLICY "institution_assets_staff_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'institution-assets' AND public.is_staff());

CREATE POLICY "institution_assets_staff_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'institution-assets' AND public.is_staff());

CREATE POLICY "institution_assets_staff_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'institution-assets' AND public.is_admin());

NOTIFY pgrst, 'reload schema';

COMMIT;
