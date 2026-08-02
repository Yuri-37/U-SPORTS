-- Allow recipients to delete their own notifications (athlete inbox actions).

CREATE POLICY "notifications_delete_own" ON notifications FOR DELETE USING (recipient_id = auth.uid());

NOTIFY pgrst, 'reload schema';
