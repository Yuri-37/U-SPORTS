-- One COR row per student profile (enrollment); allows upsert/update for resubmits.
CREATE UNIQUE INDEX IF NOT EXISTS student_documents_one_cor_per_profile
  ON student_documents (profile_id)
  WHERE document_type = 'cor';

DROP POLICY IF EXISTS student_documents_update_own ON student_documents;
CREATE POLICY student_documents_update_own ON student_documents FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid() AND document_type = 'cor');
