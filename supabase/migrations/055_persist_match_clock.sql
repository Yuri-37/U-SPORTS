-- =============================================================================
-- 055 — Persist the live game clock on matches
--
-- The basketball game clock / shot clock (apps/web/src/hooks/useGameTimer.ts)
-- lived only in the scorer's browser tab, broadcast to spectators (Jumbotron)
-- over an ephemeral Supabase Realtime `broadcast` channel with no DB row
-- behind it at all. A reload, crash, or closed tab silently reset the visible
-- clock back to a fresh 10:00 with no way to recover the real remaining time
-- — the same class of bug migration 045 already fixed for current_period.
--
-- matches.clock_* becomes the single source of truth. It's written only on
-- explicit transitions (start/pause/adjust/reset), not every tick — clients
-- reconstruct the true current value from clock_updated_at plus elapsed real
-- time when clock_running is true, so an untimely crash still restores an
-- accurate clock rather than a stale one frozen at the last write.
-- =============================================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS clock_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS clock_running BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS shot_clock_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS shot_clock_running BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS clock_updated_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
