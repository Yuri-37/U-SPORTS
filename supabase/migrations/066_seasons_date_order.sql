-- =============================================================================
-- 066 — Enforce end_date > start_date on seasons
--
-- The create form (super-admin/Seasons.tsx) and POST /admin/seasons had no
-- date validation at all: no ordering check, no past-date guard. Date
-- ORDERING is timeless (an end before its start is never valid, regardless
-- of when "today" is) so it's safe as a real constraint.
--
-- "Start date cannot be in the past" is deliberately NOT a DB constraint —
-- see PATCH /admin/seasons/:id and utils/seasonDates.ts. `today` moves, and a
-- CHECK is re-evaluated on every UPDATE, so a "no past start" constraint
-- would make every season permanently un-updatable the day after it starts.
-- That rule lives in the API layer only, where it can distinguish create
-- (always reject a past start) from edit (only reject a start date that is
-- MOVING into the past — an already-running season's historical start date
-- must remain saveable).
-- =============================================================================

ALTER TABLE public.seasons
  DROP CONSTRAINT IF EXISTS seasons_date_order_chk;
ALTER TABLE public.seasons
  ADD CONSTRAINT seasons_date_order_chk
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date > start_date)
  NOT VALID;

-- NOT VALID enforces the rule on every future INSERT/UPDATE without scanning
-- (and potentially failing the migration on) any existing row that predates
-- this constraint. Surface violators instead of silently ignoring them.
DO $$
DECLARE
  bad_count INTEGER;
BEGIN
  SELECT count(*) INTO bad_count
  FROM public.seasons
  WHERE start_date IS NOT NULL AND end_date IS NOT NULL AND end_date <= start_date;

  IF bad_count > 0 THEN
    RAISE NOTICE 'seasons_date_order_chk: % existing season row(s) violate end_date > start_date and were left as-is (constraint is NOT VALID, not enforced retroactively).', bad_count;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
