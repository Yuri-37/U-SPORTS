-- Migration 021: team lineup slots, match active lineups, TT format on events
-- team_members.lineup_slot: 1..N = active position; NULL = bench
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS lineup_slot SMALLINT NULL;

-- At most one member per (team_id, lineup_slot) when slot is set
CREATE UNIQUE INDEX IF NOT EXISTS team_members_team_lineup_slot_key
  ON team_members (team_id, lineup_slot)
  WHERE lineup_slot IS NOT NULL;

-- matches.active_lineup: JSONB snapshot of who is on floor for each side
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS active_lineup JSONB NULL;
-- expected shape: { "a": ["athlete_uuid", ...], "b": ["athlete_uuid", ...] }

-- events.table_tennis_format: only meaningful for sport = 'table-tennis'
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS table_tennis_format TEXT NULL
  CHECK (table_tennis_format IN ('singles', 'doubles'));

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
