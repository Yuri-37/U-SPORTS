-- Track participant (team etc.) and sport for undo (action log)
ALTER TABLE scoring_actions ADD COLUMN IF NOT EXISTS participant_id UUID;
ALTER TABLE scoring_actions ADD COLUMN IF NOT EXISTS sport TEXT;
