/*
# Storage policies for retinal-scans bucket

1. Purpose
   Allow authenticated users to upload, read, and delete their own retinal
   fundus images in the public "retinal-scans" bucket. Objects are namespaced
   by user id.

2. Policies
   - SELECT: authenticated can read all (public bucket) — useful for doctor review.
   - INSERT/UPDATE/DELETE: owner only, object path must start with their user id.
*/

DROP POLICY IF EXISTS "read_retinal_scans" ON storage.objects;
CREATE POLICY "read_retinal_scans" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'retinal-scans');

DROP POLICY IF EXISTS "insert_retinal_scans" ON storage.objects;
CREATE POLICY "insert_retinal_scans" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'retinal-scans' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "update_retinal_scans" ON storage.objects;
CREATE POLICY "update_retinal_scans" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'retinal-scans' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'retinal-scans' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "delete_retinal_scans" ON storage.objects;
CREATE POLICY "delete_retinal_scans" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'retinal-scans' AND (storage.foldername(name))[1] = auth.uid()::text);
