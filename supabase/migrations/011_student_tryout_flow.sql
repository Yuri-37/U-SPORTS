-- Student enrollment (COR), tryouts, medical_cleared.
-- Runs after 009_add_user_role_student.sql (enum) and 010_fix_handle_new_user.sql (trigger without student — then this replaces trigger with student support).

DO $$ BEGIN
  CREATE TYPE public.enrollment_status AS ENUM ('unverified', 'verified');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.tryout_registration_status AS ENUM ('registered', 'selected', 'not_selected', 'withdrawn');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS enrollment_status enrollment_status,
  ADD COLUMN IF NOT EXISTS student_id TEXT,
  ADD COLUMN IF NOT EXISTS year_level TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_student_id ON profiles (student_id) WHERE student_id IS NOT NULL;

ALTER TABLE events ADD COLUMN IF NOT EXISTS is_tryout BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS student_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type = 'cor'),
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_documents_profile ON student_documents(profile_id);

CREATE TABLE IF NOT EXISTS tryout_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  sport TEXT NOT NULL,
  status tryout_registration_status NOT NULL DEFAULT 'registered',
  passed_tryout BOOLEAN,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tryout_one_active_registration_per_season_sport
  ON tryout_registrations (profile_id, season_id, sport)
  WHERE status = 'registered';

CREATE INDEX IF NOT EXISTS idx_tryout_registrations_event ON tryout_registrations(event_id);

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS medical_cleared BOOLEAN NOT NULL DEFAULT false;

-- RLS
ALTER TABLE student_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tryout_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_documents_select ON student_documents;
CREATE POLICY student_documents_select ON student_documents FOR SELECT USING (
  profile_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

DROP POLICY IF EXISTS student_documents_insert ON student_documents;
CREATE POLICY student_documents_insert ON student_documents FOR INSERT WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS student_documents_delete ON student_documents;
CREATE POLICY student_documents_delete ON student_documents FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

DROP POLICY IF EXISTS tryout_registrations_select ON tryout_registrations;
CREATE POLICY tryout_registrations_select ON tryout_registrations FOR SELECT USING (
  profile_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

DROP POLICY IF EXISTS tryout_registrations_insert ON tryout_registrations;
CREATE POLICY tryout_registrations_insert ON tryout_registrations FOR INSERT WITH CHECK (
  profile_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'student'
      AND p.enrollment_status = 'verified'
  )
);

DROP POLICY IF EXISTS tryout_registrations_update ON tryout_registrations;
CREATE POLICY tryout_registrations_update ON tryout_registrations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

-- Signup trigger: student role + enrollment
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_role public.user_role := 'athlete'::public.user_role;
  role_raw text;
BEGIN
  role_raw := COALESCE(
    NEW.raw_app_meta_data->>'role',
    NEW.raw_user_meta_data->>'role'
  );
  IF role_raw IS NOT NULL AND role_raw IN ('super_admin', 'organizer', 'athlete', 'student') THEN
    resolved_role := role_raw::public.user_role;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, enrollment_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    resolved_role,
    CASE WHEN resolved_role = 'student' THEN 'unverified'::enrollment_status ELSE NULL END
  );
  RETURN NEW;
END;
$$;
