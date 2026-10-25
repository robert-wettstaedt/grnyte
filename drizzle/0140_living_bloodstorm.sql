CREATE TABLE "content_reports" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"author_fk" integer,
	"ground" text NOT NULL,
	"note" text,
	"object_id" text NOT NULL,
	"object_name" text,
	"object_type" text NOT NULL,
	"region_fk" integer NOT NULL,
	"reporter_fk" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_source_idx";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "object_ref" text;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_author_fk_users_id_fk" FOREIGN KEY ("author_fk") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_fk_users_id_fk" FOREIGN KEY ("reporter_fk") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_reports_reporter_object_idx" ON "content_reports" USING btree ("reporter_fk","object_type","object_id");--> statement-breakpoint
CREATE INDEX "content_reports_region_fk_idx" ON "content_reports" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "content_reports_author_fk_idx" ON "content_reports" USING btree ("author_fk");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_source_idx" UNIQUE NULLS NOT DISTINCT("user_fk","source_type","actor_fk","region_fk","event_fk","area_fk","ascent_fk","block_fk","file_fk","route_fk","subject_fk","decision_fk","object_ref");--> statement-breakpoint
CREATE POLICY "users can read own content reports" ON "content_reports" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = "content_reports"."reporter_fk" AND u.auth_user_fk = (SELECT auth.uid())) AND (SELECT authorize_in_region('region.read', "content_reports"."region_fk")));