-- Public avatars bucket for profile photos (athletes and staff). Uploads go
-- through the server (POST /profile/avatar, service role -- see
-- utils/avatarStorage.ts), same pattern as institution-assets in
-- 008_storage.sql, so these RLS policies are defense-in-depth rather than
-- the primary access path. Not reusing verification-documents: that
-- feature was removed in 052 and the bucket is private, wrong for a
-- publicly-displayed avatar.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'avatars',
    'avatars',
    TRUE,
    2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  )
ON CONFLICT (id) DO NOTHING;

-- avatars: public read; each user manages only their own folder ({auth.uid()}/...).
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
