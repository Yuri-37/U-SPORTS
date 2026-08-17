-- Tracks which guided product tours a staff member has completed or skipped,
-- keyed by tour id, so the tour auto-starts at most once per version. Shape:
-- { "admin": { "at": "2026-08-17T...", "version": 1 }, "organizer": {...} }
--
-- Migration 068 removed the profiles_update_own RLS policy (closing a
-- self-service privilege-escalation hole), so the client cannot write this
-- column directly -- it must go through POST /api/profile/tour-completion
-- on the service-role key, same pattern as avatar_url.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tours_completed JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.tours_completed IS
  'Set by POST /api/profile/tour-completion. Keyed by tour id -> { at, version }. A tour whose stored version is behind the current definition auto-starts again.';

NOTIFY pgrst, 'reload schema';
