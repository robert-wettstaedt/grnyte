ALTER TABLE "bunny_streams" DROP CONSTRAINT "bunny_streams_file_fk_files_id_fk";
--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT "files_bunny_stream_fk_bunny_streams_id_fk";
--> statement-breakpoint
ALTER TABLE "bunny_streams" ADD CONSTRAINT "bunny_streams_file_fk_files_id_fk" FOREIGN KEY ("file_fk") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_bunny_stream_fk_bunny_streams_id_fk" FOREIGN KEY ("bunny_stream_fk") REFERENCES "public"."bunny_streams"("id") ON DELETE set null ON UPDATE no action;