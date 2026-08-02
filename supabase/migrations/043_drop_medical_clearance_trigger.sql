-- 043: Drop the medical-clearance trigger and function left behind by 040.
-- Migration 040 dropped the medical_cleared column but not this trigger, which
-- fires on every athletes UPDATE and crashes with "record old has no field
-- medical_cleared".

DROP TRIGGER IF EXISTS trg_athletes_medical_clearance_revoked_at ON public.athletes;
DROP FUNCTION IF EXISTS public.athletes_sync_medical_clearance_revoked_at();

NOTIFY pgrst, 'reload schema';
