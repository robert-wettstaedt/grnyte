DROP POLICY "data.delete can delete files" ON "files" CASCADE;--> statement-breakpoint
CREATE POLICY "data.edit can delete files" ON "files" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize('data.edit')));