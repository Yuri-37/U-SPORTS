-- Deleting an athlete cascades cleanly through most tables (team_members,
-- player_game_stats, player_season_stats, leaderboard_visibility,
-- verification_documents all ON DELETE CASCADE via athletes.id, and the
-- athlete row itself cascades from profiles.id). But two references were
-- left at the Postgres default (NO ACTION / RESTRICT), which would turn a
-- routine athlete deletion into an opaque foreign-key-violation 500:
--
--   teams.captain_id        -- an athlete who happens to captain a team
--   scoring_actions.athlete_id -- an athlete who ever scored a point
--
-- Both columns are already nullable, so the correct behavior was always
-- "clear the reference, keep the row" -- a deleted captain leaves the team
-- captain-less, not deleted; a deleted scorer's point log entries survive
-- (the score itself and the match are not this athlete's data) with the
-- attribution cleared.
ALTER TABLE public.teams
  DROP CONSTRAINT IF EXISTS teams_captain_id_fkey,
  ADD CONSTRAINT teams_captain_id_fkey
    FOREIGN KEY (captain_id) REFERENCES public.athletes(id) ON DELETE SET NULL;

ALTER TABLE public.scoring_actions
  DROP CONSTRAINT IF EXISTS scoring_actions_athlete_id_fkey,
  ADD CONSTRAINT scoring_actions_athlete_id_fkey
    FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';

-- audit_logs.actor_id is NOT NULL REFERENCES profiles(id) with no ON DELETE,
-- which blocks deleting any account that has ever performed a logged action.
-- Every athlete accepts the privacy notice, so in practice this blocked
-- deleting essentially every athlete with the opaque Supabase message
-- "Database error deleting user".
--
-- Dropping the audit rows would destroy the record of what happened, which is
-- the opposite of what an audit log is for. Anonymizing the actor keeps the
-- event -- action, entity, details, timestamp -- and loses only the "who",
-- which is the same trade-off the deletion itself already makes.
ALTER TABLE public.audit_logs ALTER COLUMN actor_id DROP NOT NULL;

ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey,
  ADD CONSTRAINT audit_logs_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.audit_logs.actor_id IS
  'NULL means the acting account was deleted; the event itself is retained.';

NOTIFY pgrst, 'reload schema';
