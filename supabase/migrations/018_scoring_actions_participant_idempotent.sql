-- Idempotent fix: ensure scoring_actions has API-required columns (participant_id, sport).
-- If 013 never ran on a given project, inserts from the Node API fail with a schema cache error.
ALTER TABLE scoring_actions ADD COLUMN IF NOT EXISTS participant_id UUID;
ALTER TABLE scoring_actions ADD COLUMN IF NOT EXISTS sport TEXT;
