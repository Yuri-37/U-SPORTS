-- Optional public / organizer-facing event description
ALTER TABLE events ADD COLUMN IF NOT EXISTS description TEXT;
