-- Matches left open inside an event that is already over.
--
-- Marking an event finished or cancelled never touched its matches, so a match
-- that was live (or still scheduled) at that moment stayed that way. A live one
-- showed on the public hub as "live" with no way to score it, because scoring
-- needs the event to be in progress. The API now closes an event's matches
-- together with the event; this clears the ones that were left behind before.
--
-- Only matches of events that are completed or cancelled are touched. Events
-- still in progress (the ones used for live scoring) are not affected.

UPDATE public.matches
SET status = 'cancelled',
    scoring_locked_by = NULL,
    clock_locked_by = NULL
WHERE status IN ('live', 'scheduled')
  AND event_id IN (
    SELECT id FROM public.events WHERE status IN ('completed', 'cancelled')
  );
