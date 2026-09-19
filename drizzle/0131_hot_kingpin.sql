ALTER TABLE "bunny_streams" ADD COLUMN "readiness" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
-- Only videos old enough to have certainly finished encoding. A clip uploaded shortly before this
-- runs may still be at the host, and `ready` is a one-way door that reconciliation never revisits
-- (it scans `pending` only), so marking it ready here would strand it as unplayable forever.
-- The recent tail starts `pending` instead and corrects itself, which is the safe direction.
UPDATE "bunny_streams" SET "readiness" = 'ready'
WHERE "file_fk" IN (SELECT "id" FROM "files" WHERE "created_at" < now() - interval '24 hours');
