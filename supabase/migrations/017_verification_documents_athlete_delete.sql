-- Allow athletes to remove their own verification document rows (e.g. replace medical cert upload).
CREATE POLICY "vdocs_delete_own_athlete" ON verification_documents FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM athletes a
    WHERE a.id = verification_documents.athlete_id AND a.profile_id = auth.uid()
  )
);
