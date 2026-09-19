-- Private staging bucket for browser image uploads (see files.remote.ts /
-- finalizeImage): the client uploads directly to `<auth-uid>/<name>` here, the
-- server moves the file to Nextcloud and deletes it. Bucket-level constraints
-- mirror config.files.maxSize (50MB) and restrict staging to images.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('staging', 'staging', false, 52428800, ARRAY['image/*'])
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint
-- On managed Supabase the migration role doesn't own storage.objects, so
-- CREATE POLICY can fail with "must be owner of table objects" there (works on
-- the self-hosted dev stack, where the role is superuser). Warn instead of
-- wedging the migration chain — if the warning fires, create these three
-- policies once via the dashboard's Storage policy editor.
DO $$
BEGIN
  CREATE POLICY "authenticated can upload to own staging folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staging' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));
  CREATE POLICY "authenticated can read own staging folder"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'staging' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));
  CREATE POLICY "authenticated can delete own staging folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'staging' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));
  -- The upload XHR sends x-upsert (retries after a lost response), and storage
  -- upsert needs UPDATE on top of INSERT.
  CREATE POLICY "authenticated can update own staging folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'staging' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'staging policies not created — add them via the Supabase dashboard (Storage → staging → Policies)';
  WHEN duplicate_object THEN
    NULL; -- already created manually; nothing to do
END $$;
