-- Indexes for the filters the app uses on every page load.
--
-- Postgres indexes a primary key and a UNIQUE constraint automatically, but not
-- a plain foreign key, so lookups like "all matches of this event", "all teams
-- of this season" or "which teams is this athlete on" were sequential scans.
-- That is invisible with a few hundred rows and slow with a few thousand.
-- All use IF NOT EXISTS, so re-running is harmless.

CREATE INDEX IF NOT EXISTS idx_matches_event_id ON public.matches (event_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches (status);
CREATE INDEX IF NOT EXISTS idx_matches_bracket_id ON public.matches (bracket_id);
CREATE INDEX IF NOT EXISTS idx_brackets_event_id ON public.brackets (event_id);

CREATE INDEX IF NOT EXISTS idx_events_season_id ON public.events (season_id);
CREATE INDEX IF NOT EXISTS idx_events_sport_status ON public.events (sport, status);

CREATE INDEX IF NOT EXISTS idx_teams_season_id ON public.teams (season_id);
CREATE INDEX IF NOT EXISTS idx_teams_sport ON public.teams (sport);

-- team_id is already the leading column of the (team_id, athlete_id) unique key.
CREATE INDEX IF NOT EXISTS idx_team_members_athlete_id ON public.team_members (athlete_id);
CREATE INDEX IF NOT EXISTS idx_team_coaches_team_id ON public.team_coaches (team_id);

CREATE INDEX IF NOT EXISTS idx_event_participants_participant_id
  ON public.event_participants (participant_id);
CREATE INDEX IF NOT EXISTS idx_match_scores_participant_id ON public.match_scores (participant_id);

CREATE INDEX IF NOT EXISTS idx_player_season_stats_season_sport
  ON public.player_season_stats (season_id, sport);
CREATE INDEX IF NOT EXISTS idx_team_season_stats_season_id
  ON public.team_season_stats (season_id);

CREATE INDEX IF NOT EXISTS idx_athletes_sport_status ON public.athletes (sport, season_status);
