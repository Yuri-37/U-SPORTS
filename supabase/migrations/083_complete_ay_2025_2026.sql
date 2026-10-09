-- Only one season is active at a time. Migration 082 put both academic-year
-- seasons back to active; the older one (AY 2025-2026, which ended in January
-- 2026 and has no running events) goes back to completed so AY 2026-2027 is the
-- single active season.

UPDATE public.seasons
SET status = 'completed'
WHERE name = 'AY 2025-2026'
  AND status = 'active';
