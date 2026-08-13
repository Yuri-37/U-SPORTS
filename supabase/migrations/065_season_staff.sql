-- =============================================================================
-- 065 — Season staff assignment: who's in charge of a season
--
-- Requested directly by the professor's review (see the hand-drawn flow:
-- "Admin -- before simula ng season, magtatalaga ng organizing team"). Keyed
-- on organizers.id, not profiles.id, because admin.ts's staff-creation route
-- creates an organizers row for BOTH the Organizer and Coach roles -- one FK
-- covers both.
--
-- THE BACKFILL BELOW IS THE MOST IMPORTANT STATEMENT IN THIS FILE. Once the
-- application layer enforces "assigned seasons INTERSECT assigned sports"
-- (added in a later commit, not this migration), every Organizer/Coach with
-- zero season_staff rows loses write access to every season instantly. This
-- assigns every existing organizer to every existing season so nobody is
-- locked out the moment enforcement ships. Verify the row count below is
-- seasons_count * organizers_count before deploying the code that reads
-- this table for a permission decision.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.season_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  organizer_id UUID NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (season_id, organizer_id)
);

CREATE INDEX IF NOT EXISTS idx_season_staff_organizer ON public.season_staff(organizer_id);
CREATE INDEX IF NOT EXISTS idx_season_staff_season ON public.season_staff(season_id);

INSERT INTO public.season_staff (season_id, organizer_id)
SELECT s.id, o.id
FROM public.seasons s
CROSS JOIN public.organizers o
ON CONFLICT (season_id, organizer_id) DO NOTHING;

ALTER TABLE public.season_staff ENABLE ROW LEVEL SECURITY;

-- Any authenticated staff member can see who's assigned where (needed for
-- e.g. a Coach's own "your seasons" dashboard card); guests get nothing.
DROP POLICY IF EXISTS "season_staff_select_staff" ON public.season_staff;
CREATE POLICY "season_staff_select_staff" ON public.season_staff FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('Admin'::public.user_role, 'Organizer'::public.user_role, 'Coach'::public.user_role)
  )
);

DROP POLICY IF EXISTS "season_staff_write_admin" ON public.season_staff;
CREATE POLICY "season_staff_write_admin" ON public.season_staff FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'Admin'::public.user_role
  )
);

GRANT SELECT ON public.season_staff TO authenticated;
GRANT ALL ON public.season_staff TO service_role;

NOTIFY pgrst, 'reload schema';
