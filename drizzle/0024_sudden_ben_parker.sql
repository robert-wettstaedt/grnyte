CREATE TABLE IF NOT EXISTS "bunny_streams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"file_fk" integer
);
--> statement-breakpoint
ALTER TABLE "bunny_streams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "visibility" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "bunny_stream_fk" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bunny_streams" ADD CONSTRAINT "bunny_streams_file_fk_files_id_fk" FOREIGN KEY ("file_fk") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "files" ADD CONSTRAINT "files_bunny_stream_fk_bunny_streams_id_fk" FOREIGN KEY ("bunny_stream_fk") REFERENCES "public"."bunny_streams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE POLICY "data.read can insert bunny_streams" ON "bunny_streams" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize('data.read')));--> statement-breakpoint
CREATE POLICY "data.read can read bunny_streams" ON "bunny_streams" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize('data.read')));--> statement-breakpoint
CREATE POLICY "data.edit can update bunny_streams" ON "bunny_streams" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize('data.edit'))) WITH CHECK ((SELECT authorize('data.edit')));--> statement-breakpoint
CREATE POLICY "data.edit can delete bunny_streams" ON "bunny_streams" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize('data.edit')));