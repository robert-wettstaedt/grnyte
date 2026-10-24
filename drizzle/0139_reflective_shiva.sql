CREATE TABLE "deleted_comments" (
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reaction_fk" integer PRIMARY KEY NOT NULL,
	"user_fk" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deleted_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "moderation_decision_subjects" (
	"decision_fk" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"items" jsonb NOT NULL,
	"user_fk" integer
);
--> statement-breakpoint
ALTER TABLE "moderation_decision_subjects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "moderation_decisions" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"actor_fk" integer,
	"ground" text NOT NULL,
	"object_id" text NOT NULL,
	"object_type" text NOT NULL,
	"reason" text NOT NULL,
	"region_fk" integer,
	"removed_body" text,
	"reversed_at" timestamp with time zone,
	"reversed_by_fk" integer
);
--> statement-breakpoint
ALTER TABLE "moderation_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_source_idx";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "decision_fk" integer;--> statement-breakpoint
ALTER TABLE "reactions" ADD COLUMN "removed_by" text;--> statement-breakpoint
ALTER TABLE "deleted_comments" ADD CONSTRAINT "deleted_comments_reaction_fk_reactions_id_fk" FOREIGN KEY ("reaction_fk") REFERENCES "public"."reactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_comments" ADD CONSTRAINT "deleted_comments_user_fk_users_id_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_decision_subjects" ADD CONSTRAINT "moderation_decision_subjects_decision_fk_moderation_decisions_id_fk" FOREIGN KEY ("decision_fk") REFERENCES "public"."moderation_decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_decision_subjects" ADD CONSTRAINT "moderation_decision_subjects_user_fk_users_id_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_decisions" ADD CONSTRAINT "moderation_decisions_actor_fk_users_id_fk" FOREIGN KEY ("actor_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_decisions" ADD CONSTRAINT "moderation_decisions_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_decisions" ADD CONSTRAINT "moderation_decisions_reversed_by_fk_users_id_fk" FOREIGN KEY ("reversed_by_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deleted_comments_created_at_idx" ON "deleted_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "deleted_comments_user_fk_idx" ON "deleted_comments" USING btree ("user_fk");--> statement-breakpoint
CREATE INDEX "moderation_decision_subjects_decision_fk_idx" ON "moderation_decision_subjects" USING btree ("decision_fk");--> statement-breakpoint
CREATE INDEX "moderation_decision_subjects_user_fk_idx" ON "moderation_decision_subjects" USING btree ("user_fk");--> statement-breakpoint
CREATE INDEX "moderation_decisions_created_at_idx" ON "moderation_decisions" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_decision_fk_moderation_decisions_id_fk" FOREIGN KEY ("decision_fk") REFERENCES "public"."moderation_decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_source_idx" UNIQUE NULLS NOT DISTINCT("user_fk","source_type","actor_fk","region_fk","event_fk","area_fk","ascent_fk","block_fk","file_fk","route_fk","subject_fk","decision_fk");--> statement-breakpoint
ALTER POLICY "users can read own notifications" ON "notifications" TO authenticated USING ((SELECT auth.uid()) = auth_user_fk AND (source_type IN ('content_removed', 'content_restored') OR (SELECT authorize_in_region('region.read', region_fk))));--> statement-breakpoint
-- A deleted comment keeps neither words nor author on its synced row; ones deleted before this did.
UPDATE "reactions" SET "body" = '…', "user_fk" = NULL, "auth_user_fk" = NULL WHERE "type" = 'comment' AND "deleted_at" IS NOT NULL;
