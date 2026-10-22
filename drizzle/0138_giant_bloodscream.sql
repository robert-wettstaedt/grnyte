ALTER TABLE "events" ALTER COLUMN "actor_fk" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "actor_fk" DROP NOT NULL;