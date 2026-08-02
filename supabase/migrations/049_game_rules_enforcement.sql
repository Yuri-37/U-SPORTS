-- =============================================================================
-- 049 — Schema for game-flow rule enforcement (match auto-end, serve tracking,
-- basketball fouls/bonus, volleyball subs/timeouts)
--
-- Design principle: derive everything, store almost nothing. No new tables —
-- foul-out derives from existing player_game_stats.stats.fouls; team fouls,
-- subs and timeouts derive from period-scoped scoring_actions counts; serve
-- derives arithmetically from the score plus the one new bit below.
-- =============================================================================

-- Organizer-configurable match length for volleyball/table-tennis. NULL falls
-- back to the sport default (5) in application code. This does NOT change
-- getSetWinner's per-set target (25/15 win-by-2 for volleyball, 11 for table
-- tennis stays hardcoded, since that's the actual rule) — it only feeds the
-- "how many sets/games are needed to win the match" decision calculation.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS best_of SMALLINT NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_best_of_chk;
ALTER TABLE public.events
  ADD CONSTRAINT events_best_of_chk CHECK (best_of IS NULL OR best_of IN (1, 3, 5, 7));

-- Who served first. Polymorphic like participant_id elsewhere in this schema —
-- a team id for volleyball, an athlete id for table-tennis singles — so no FK.
-- Powers serve derivation: every subsequent server is computed arithmetically
-- from this plus the score, never stored per-rally.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS first_server_id UUID NULL;

-- Backs every new per-period/per-team count this feature needs: team fouls
-- per quarter, substitutions per set, timeouts per set/match. All of them
-- filter on exactly (match_id, action_type, quarter_or_set, undone=false).
CREATE INDEX IF NOT EXISTS idx_scoring_actions_match_action_period
  ON public.scoring_actions (match_id, action_type, quarter_or_set)
  WHERE undone = false;

NOTIFY pgrst, 'reload schema';
