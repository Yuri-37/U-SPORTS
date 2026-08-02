-- Profiles (extends Supabase Auth users)
CREATE TYPE user_role AS ENUM ('super_admin', 'organizer', 'athlete');

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'athlete',
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organizers
CREATE TABLE organizers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  assigned_sports TEXT[] DEFAULT '{}',
  permissions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  invited_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Athletes
CREATE TYPE verification_status AS ENUM ('pending', 'under_review', 'approved', 'rejected');
CREATE TYPE season_player_status AS ENUM ('active', 'inactive');

CREATE TABLE athletes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  student_id TEXT NOT NULL UNIQUE,
  sport TEXT NOT NULL,
  position TEXT DEFAULT '',
  jersey_number TEXT,
  year_level TEXT DEFAULT '',
  department TEXT DEFAULT '',
  verification_status verification_status DEFAULT 'pending',
  season_status season_player_status DEFAULT 'active',
  reviewer_id UUID REFERENCES profiles(id),
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Verification documents
CREATE TABLE verification_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('cor', 'medical_cert')),
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on auth signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'athlete')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_documents ENABLE ROW LEVEL SECURITY;

-- Profiles: everyone can read; only owner can update
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT USING (TRUE);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (id = auth.uid());

-- Organizers: read by authenticated; write by super_admin
CREATE POLICY "organizers_select_auth" ON organizers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "organizers_write_super_admin" ON organizers FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- Athletes: public read for approved; write by self or organizer
CREATE POLICY "athletes_select_approved" ON athletes FOR SELECT USING (
  verification_status = 'approved'
  OR profile_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);
CREATE POLICY "athletes_insert_self" ON athletes FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "athletes_update_self_or_org" ON athletes FOR UPDATE USING (
  profile_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

-- Verification docs: athlete sees own; organizer sees all
CREATE POLICY "vdocs_select" ON verification_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM athletes a WHERE a.id = athlete_id AND a.profile_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);
CREATE POLICY "vdocs_insert_athlete" ON verification_documents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM athletes a WHERE a.id = athlete_id AND a.profile_id = auth.uid())
);

-- Institution / sports_config (tables from 001_institution.sql): write policies reference profiles
CREATE POLICY "institution_write_super_admin" ON institution
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "sports_config_write_super_admin" ON sports_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );
