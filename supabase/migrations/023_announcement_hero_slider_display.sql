-- Allow hero_slider on announcements.display_mode (Hero slider marquee).

-- Drop existing check (name matches PostgreSQL default for column CHECK on display_mode).
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_display_mode_check;

ALTER TABLE announcements
  ADD CONSTRAINT announcements_display_mode_check
  CHECK (display_mode IN ('banner', 'notification_only', 'hero_slider'));

NOTIFY pgrst, 'reload schema';
