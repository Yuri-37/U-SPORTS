-- Human-readable event URLs (/guest/events/preseason-classic-c9624c) instead of
-- a raw UUID. Slugs are immutable once generated — a later rename doesn't
-- change the slug, so shared links keep working.
ALTER TABLE events ADD COLUMN slug TEXT;

UPDATE events
SET slug = trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')))
  || '-' || right(id::text, 6)
WHERE slug IS NULL;

ALTER TABLE events ALTER COLUMN slug SET NOT NULL;
ALTER TABLE events ADD CONSTRAINT events_slug_unique UNIQUE (slug);
CREATE INDEX idx_events_slug ON events (slug);

NOTIFY pgrst, 'reload schema';
