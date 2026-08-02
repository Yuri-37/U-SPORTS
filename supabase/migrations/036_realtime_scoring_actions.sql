-- Broadcast scoring_actions so clients can react to live scoring steps (period/clock) via Realtime.
-- RLS: see 015_scoring_actions_live_public_read.sql (public read when match is live).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'scoring_actions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE scoring_actions;
  END IF;
END $$;
