-- =============================================================================
-- 054 — Remove the Setup Wizard; ship usable defaults instead
--
-- The wizard was a deployment-time gate: until it was completed, the web app
-- redirected everything to /setup and the mobile app had no school branding or
-- season to read. It was also a single point of failure — if any step errored,
-- the platform was unusable with no way forward.
--
-- The platform now ships with a default institution profile and an active
-- season. Both remain fully editable (Super Admin → Settings / Seasons); these
-- are starting values, not hardcoded behaviour.
--
-- Seeded here rather than in supabase/seed.sql because migrations run on every
-- environment, while seed.sql only runs for local `supabase db reset`.
-- Idempotent: existing deployments keep whatever the client already customised.
-- =============================================================================

-- Institution is a single-row table; only populate it when empty.
INSERT INTO public.institution (
  name, abbreviation, tagline,
  primary_color, secondary_color,
  address, region
)
SELECT
  'National University Dasmariñas',
  'NU Dasmariñas',
  'Animo NU!',
  '#002D62',
  '#FFD700',
  'Governor''s Drive, Dasmariñas, Cavite',
  'CALABARZON'
WHERE NOT EXISTS (SELECT 1 FROM public.institution);

-- The wizard created the first season. Seed one so season-scoped features
-- (events, teams, standings, stats, insights) work immediately on a fresh
-- deployment. `created_by` is nullable and left NULL — no admin exists yet at
-- migration time; the API bootstraps that account on first boot.
INSERT INTO public.seasons (name, status, start_date, end_date)
SELECT 'AY 2025-2026', 'active', DATE '2025-08-01', DATE '2026-05-31'
WHERE NOT EXISTS (SELECT 1 FROM public.seasons);

-- Active sports are already seeded idempotently by migration 047.

-- No setup gate any more: nothing reads this flag once the wizard is gone.
ALTER TABLE public.institution DROP COLUMN IF EXISTS is_setup_complete;
