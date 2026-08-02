-- 052: Finish removing the athlete review / medical-clearance system (see 040).
-- 040 dropped the verification_documents table and review columns but left the
-- Storage bucket + policies behind. The COR/medical-cert upload feature is
-- abandoned; athletes are Active/Inactive via athletes.season_status only.

DROP POLICY IF EXISTS "verification_documents_select" ON storage.objects;
DROP POLICY IF EXISTS "verification_documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "verification_documents_update" ON storage.objects;
DROP POLICY IF EXISTS "verification_documents_delete" ON storage.objects;

-- storage.buckets/storage.objects have a delete-protection trigger that
-- rejects raw SQL DELETEs ("Use the Storage API instead"), so the bucket
-- itself can't be dropped from a migration. Remove it once per environment
-- via the Storage API or Studio: DELETE /storage/v1/bucket/verification-documents
-- (any objects in it must be deleted the same way first).

NOTIFY pgrst, 'reload schema';
