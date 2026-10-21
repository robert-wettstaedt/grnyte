ALTER TABLE "activities" ALTER COLUMN "user_fk" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "areas" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "blocks" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reactions" ALTER COLUMN "auth_user_fk" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reactions" ALTER COLUMN "user_fk" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "regions" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "created_by" DROP NOT NULL;