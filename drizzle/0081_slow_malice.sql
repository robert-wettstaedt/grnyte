ALTER TABLE "topos" ADD COLUMN "order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "topos" SET "order" = "id";