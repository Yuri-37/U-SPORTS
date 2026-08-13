-- =============================================================================
-- 063 — Backfill events.table_tennis_format and guard against future NULLs
--
-- Bug: every table-tennis event in production has table_tennis_format = NULL.
-- services/matchReviewData.ts's ttSlotsPerSide() treats a NULL/missing format
-- as 'singles' (`ttFormatRaw ?? 'singles'`), so a doubles match's roster gets
-- sliced to one athlete per side everywhere the match is reviewed — including
-- the mobile roster screen. The event CREATE path (routes/events.ts) already
-- defaults and persists this column correctly; the NULLs came from
-- resetAndSeed.ts, which never set it. That script is fixed separately.
--
-- Not a blanket NOT NULL DEFAULT 'singles': routes/events.ts deliberately
-- writes NULL for basketball and volleyball, where the column is meaningless.
-- A blanket NOT NULL would reject every non-table-tennis event insert. Instead:
-- backfill only table-tennis rows, then add a conditional CHECK so a
-- table-tennis event can never again be created/left with a NULL format.
-- =============================================================================

UPDATE public.events
SET table_tennis_format = 'singles'
WHERE sport = 'table-tennis' AND table_tennis_format IS NULL;

-- NOT VALID: enforced on every future INSERT/UPDATE without scanning (and
-- potentially failing on) rows that predate this migration in some other
-- environment. The UPDATE above already cleans production; NOT VALID is
-- belt-and-suspenders for any environment where that UPDATE matched zero rows
-- for a reason we haven't seen.
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_tt_format_required_chk;
ALTER TABLE public.events
  ADD CONSTRAINT events_tt_format_required_chk
  CHECK (sport <> 'table-tennis' OR table_tennis_format IS NOT NULL)
  NOT VALID;

NOTIFY pgrst, 'reload schema';
