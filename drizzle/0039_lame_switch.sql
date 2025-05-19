CREATE TABLE "region_members" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"role" "app_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"auth_user_fk" uuid NOT NULL,
	"invited_by" integer,
	"region_fk" integer,
	"user_fk" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "region_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "regions" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "blocks" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "first_ascensionists" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "region_fk" integer;--> statement-breakpoint
ALTER TABLE "region_members" ADD CONSTRAINT "region_members_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_members" ADD CONSTRAINT "region_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_members" ADD CONSTRAINT "region_members_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_members" ADD CONSTRAINT "region_members_user_fk_users_id_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "first_ascensionists" ADD CONSTRAINT "first_ascensionists_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "areas_region_fk_idx" ON "areas" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "blocks_region_fk_idx" ON "blocks" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "first_ascensionists_region_fk_idx" ON "first_ascensionists" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "routes_region_fk_idx" ON "routes" USING btree ("region_fk");