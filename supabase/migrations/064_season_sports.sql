-- =============================================================================
-- 064 — Per-season sport selection
--
-- sports_config is global (no season_id) and has no admin UI at all today —
-- which sports "run" in a season is purely implicit from whatever events/
-- teams someone happens to create with that season_id. This links seasons to
-- the sports they carry, so the Event/Team forms can offer only a season's
-- sports instead of silently accepting a mismatch that surfaces later as
-- "No more teams available" with no explanation (EventDetail.tsx's team
-- picker already filters by sport AND season_id).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.season_sports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  sport TEXT NOT NULL REFERENCES public.sports_config(slug) ON UPDATE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (season_id, sport)
);

CREATE INDEX IF NOT EXISTS idx_season_sports_season ON public.season_sports(season_id);

-- Backfill every existing season with every currently-active sport, so
-- nothing already in the database is left with zero sports (which would make
-- it unusable in every Event/Team form the moment enforcement ships).
INSERT INTO public.season_sports (season_id, sport)
SELECT s.id, sc.slug
FROM public.seasons s
CROSS JOIN public.sports_config sc
WHERE sc.is_active = TRUE
ON CONFLICT (season_id, sport) DO NOTHING;

-- Safety net: if sports_config is empty/unseeded in some environment, the
-- CROSS JOIN above inserts nothing and every season is left with zero sports.
-- Fall back to the three sports the app hardcodes elsewhere (events.ts's
-- z.enum, useOrganizerSportScope's FALLBACK) rather than ship a season no
-- form can populate.
INSERT INTO public.season_sports (season_id, sport)
SELECT s.id, v.sport
FROM public.seasons s
CROSS JOIN (VALUES ('basketball'), ('volleyball'), ('table-tennis')) AS v(sport)
WHERE NOT EXISTS (SELECT 1 FROM public.season_sports ss WHERE ss.season_id = s.id)
  AND EXISTS (SELECT 1 FROM public.sports_config sc WHERE sc.slug = v.sport)
ON CONFLICT (season_id, sport) DO NOTHING;

ALTER TABLE public.season_sports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "season_sports_select_all" ON public.season_sports;
CREATE POLICY "season_sports_select_all" ON public.season_sports FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "season_sports_write_admin" ON public.season_sports;
CREATE POLICY "season_sports_write_admin" ON public.season_sports FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'Admin'::public.user_role
  )
);

GRANT SELECT ON public.season_sports TO anon, authenticated;
GRANT ALL ON public.season_sports TO service_role;

NOTIFY pgrst, 'reload schema';
