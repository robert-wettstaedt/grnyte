-- First, drop the foreign key constraints
ALTER TABLE "bunny_streams" DROP CONSTRAINT IF EXISTS "bunny_streams_file_fk_files_id_fk";
ALTER TABLE "topos" DROP CONSTRAINT IF EXISTS "topos_file_fk_files_id_fk";
--> statement-breakpoint

-- Now change the column types
ALTER TABLE "files" ALTER COLUMN "id" SET DATA TYPE text;
--> statement-breakpoint
ALTER TABLE "bunny_streams" ALTER COLUMN "file_fk" SET DATA TYPE text;
--> statement-breakpoint
ALTER TABLE "topos" ALTER COLUMN "file_fk" SET DATA TYPE text;
--> statement-breakpoint

-- Finally, recreate the foreign key constraints
ALTER TABLE "bunny_streams" ADD CONSTRAINT "bunny_streams_file_fk_files_id_fk"
  FOREIGN KEY ("file_fk") REFERENCES "files"("id");
--> statement-breakpoint
ALTER TABLE "topos" ADD CONSTRAINT "topos_file_fk_files_id_fk"
  FOREIGN KEY ("file_fk") REFERENCES "files"("id");