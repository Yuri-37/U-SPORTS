-- Phase J: merge announcement type + urgency into a single source of truth.
-- (1) Back-fill urgency to match type for existing rows.
-- (2) Add audience_sport column for sport-targeted notifications.
-- (3) Trigger: auto-derive urgency from type on every INSERT/UPDATE so urgency
--     is no longer a user-facing field — it is always implied by type.

UPDATE public.announcements SET urgency = 'critical' WHERE type = 'emergency';
UPDATE public.announcements SET urgency = 'high'     WHERE type = 'reschedule';
UPDATE public.announcements SET urgency = 'low'      WHERE type = 'system';
-- 'reminder' already maps to 'normal'; no update needed.

-- New column: stores the sport slug when audience_type = 'sport'.
-- audience_id (UUID) is used for event / team targeting only.
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS audience_sport TEXT;

-- Trigger function: map type → urgency automatically.
CREATE OR REPLACE FUNCTION public.set_announcement_urgency_from_type()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.urgency := CASE NEW.type
    WHEN 'emergency' THEN 'critical'::announcement_urgency
    WHEN 'reschedule' THEN 'high'::announcement_urgency
    WHEN 'system'     THEN 'low'::announcement_urgency
    ELSE                   'normal'::announcement_urgency
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_announcement_urgency_from_type ON public.announcements;
CREATE TRIGGER trg_announcement_urgency_from_type
  BEFORE INSERT OR UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_announcement_urgency_from_type();
