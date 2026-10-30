CREATE TABLE "import_refs" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"area_fk" integer,
	"block_fk" integer,
	"imported" jsonb NOT NULL,
	"ref" text NOT NULL,
	"route_fk" integer,
	"source" text NOT NULL,
	CONSTRAINT "import_refs_one_target" CHECK (num_nonnulls("import_refs"."area_fk", "import_refs"."block_fk", "import_refs"."route_fk") = 1),
	CONSTRAINT "import_refs_named" CHECK ("import_refs"."source" <> '' and "import_refs"."ref" <> '')
);
--> statement-breakpoint
ALTER TABLE "import_refs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "import_refs" ADD CONSTRAINT "import_refs_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_refs" ADD CONSTRAINT "import_refs_area_fk_areas_id_fk" FOREIGN KEY ("area_fk") REFERENCES "public"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_refs" ADD CONSTRAINT "import_refs_block_fk_blocks_id_fk" FOREIGN KEY ("block_fk") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_refs" ADD CONSTRAINT "import_refs_route_fk_routes_id_fk" FOREIGN KEY ("route_fk") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_refs_area_line" ON "import_refs" USING btree ("source","ref") WHERE "import_refs"."area_fk" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "import_refs_block_line" ON "import_refs" USING btree ("source","ref") WHERE "import_refs"."block_fk" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "import_refs_route_line" ON "import_refs" USING btree ("source","ref") WHERE "import_refs"."route_fk" is not null;--> statement-breakpoint
CREATE INDEX "import_refs_area_fk_idx" ON "import_refs" USING btree ("area_fk") WHERE "import_refs"."area_fk" is not null;--> statement-breakpoint
CREATE INDEX "import_refs_block_fk_idx" ON "import_refs" USING btree ("block_fk") WHERE "import_refs"."block_fk" is not null;--> statement-breakpoint
CREATE INDEX "import_refs_route_fk_idx" ON "import_refs" USING btree ("route_fk") WHERE "import_refs"."route_fk" is not null;--> statement-breakpoint
CREATE INDEX "import_refs_region_fk_idx" ON "import_refs" USING btree ("region_fk","source");