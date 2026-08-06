-- "Delete" on the notification inbox now hides rather than removes the row,
-- so a user's notification history survives a client-side clear/dismiss.
ALTER TABLE notifications ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- Hard delete is no longer exposed by either client — drop the RLS policy so
-- it's actually blocked at the database layer, not just unused in the UI.
DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;

NOTIFY pgrst, 'reload schema';
