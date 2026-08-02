-- Track how long a match lasted (written when match ends)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- Basketball quarter length preference (in minutes, default 10)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS quarter_length_minutes INTEGER DEFAULT 10;
