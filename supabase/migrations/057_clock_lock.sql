-- Independent write-lock for the game clock, separate from scoring_locked_by,
-- so one organizer can run the clock while a different organizer scores the
-- same live match. Basketball-only in practice (the only sport with a clock
-- today) but added generically like scoring_locked_by.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS clock_locked_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS clock_locked_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
