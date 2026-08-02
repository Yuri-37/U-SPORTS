-- Scope insights to seasons (analytics / CSV parity) and enable reliable upserts from compute-insights.

ALTER TABLE public.insights
  ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Keep the newest row per entity scope before adding uniqueness.
DELETE FROM public.insights a
WHERE a.id NOT IN (
  SELECT id FROM (
    SELECT DISTINCT ON (entity_type, entity_id, sport, season_id, insight_type)
      id
    FROM public.insights
    ORDER BY entity_type, entity_id, sport, season_id, insight_type, created_at DESC NULLS LAST
  ) kept
);

CREATE UNIQUE INDEX IF NOT EXISTS insights_entity_season_sport_type_uidx
  ON public.insights (entity_type, entity_id, sport, season_id, insight_type);

CREATE INDEX IF NOT EXISTS idx_insights_season_sport
  ON public.insights (season_id, sport)
  WHERE season_id IS NOT NULL;
