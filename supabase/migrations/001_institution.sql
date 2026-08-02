-- Institution (single row - school identity)
CREATE TABLE institution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  tagline TEXT DEFAULT '',
  primary_color TEXT DEFAULT '#002D62',
  secondary_color TEXT DEFAULT '#FFD700',
  logo_url TEXT,
  banner_url TEXT,
  address TEXT DEFAULT '',
  region TEXT DEFAULT '',
  staff_email_domain TEXT NOT NULL DEFAULT 'nu-dasma.edu.ph',
  student_email_domain TEXT NOT NULL DEFAULT 'students.nu-dasma.edu.ph',
  is_setup_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sports configuration
CREATE TABLE sports_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  icon TEXT DEFAULT '🏆',
  is_active BOOLEAN DEFAULT TRUE,
  stat_definitions JSONB DEFAULT '{}',
  positions JSONB DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE institution ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read institution (needed for setup check, guest hub branding)
CREATE POLICY "institution_read_all" ON institution FOR SELECT USING (TRUE);

-- Super-admin institution/sports_config write policies live in 002_profiles_roles.sql
-- (profiles must exist before policies can reference it).

-- Anyone can read sports config
CREATE POLICY "sports_config_read_all" ON sports_config FOR SELECT USING (TRUE);
