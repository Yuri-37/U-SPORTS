-- Put the two academic-year seasons back to active.
--
-- Activating the "SECA Week" season completed every other active season, which
-- turned "AY 2026-2027" into a completed season while its events (and live
-- matches) were still running. The API no longer completes other seasons when
-- one is activated, so several seasons can be active together; this restores
-- the two academic-year seasons that were closed that way.

UPDATE public.seasons
SET status = 'active'
WHERE name IN ('AY 2026-2027', 'AY 2025-2026')
  AND status = 'completed';
