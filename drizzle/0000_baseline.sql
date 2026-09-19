CREATE TYPE "public"."app_permission" AS ENUM('region.read', 'region.edit', 'region.delete', 'region.admin', 'app.admin');--> statement-breakpoint
CREATE TYPE "public"."app_role" AS ENUM('app_admin', 'region_user', 'region_maintainer', 'region_admin');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('created', 'updated', 'deleted', 'uploaded');--> statement-breakpoint
CREATE TABLE "activities" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"type" "activity_type" NOT NULL,
	"user_fk" integer NOT NULL,
	"entity_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"parent_entity_id" text,
	"parent_entity_type" text,
	"column_name" text,
	"metadata" text,
	"old_value" text,
	"new_value" text,
	"notified" boolean
);
--> statement-breakpoint
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "areas" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"created_by" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"region_fk" integer NOT NULL,
	"description" text,
	"type" text DEFAULT 'area' NOT NULL,
	"visibility" text,
	"walking_paths" text[],
	"geo_paths" jsonb,
	"parent_fk" integer
);
--> statement-breakpoint
ALTER TABLE "areas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ascents" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"created_by" integer NOT NULL,
	"date_time" date DEFAULT now() NOT NULL,
	"humidity" integer,
	"notes" text,
	"rating" integer,
	"temperature" integer,
	"type" text NOT NULL,
	"grade_fk" integer,
	"route_fk" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ascents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "blocks" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"created_by" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"region_fk" integer NOT NULL,
	"order" integer NOT NULL,
	"area_fk" integer NOT NULL,
	"geolocation_fk" integer
);
--> statement-breakpoint
ALTER TABLE "blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bunny_streams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"file_fk" text
);
--> statement-breakpoint
ALTER TABLE "bunny_streams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_error_logs" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"created_by" integer,
	"error" text,
	"navigator" jsonb,
	"pathname" text
);
--> statement-breakpoint
ALTER TABLE "client_error_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "favorites" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"auth_user_fk" uuid NOT NULL,
	"user_fk" integer NOT NULL,
	"entity_id" text NOT NULL,
	"entity_type" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "favorites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"path" text NOT NULL,
	"visibility" text,
	"area_fk" integer,
	"ascent_fk" integer,
	"block_fk" integer,
	"bunny_stream_fk" uuid,
	"route_fk" integer
);
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "first_ascensionists" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"name" text NOT NULL,
	"user_fk" integer
);
--> statement-breakpoint
ALTER TABLE "first_ascensionists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "geolocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"lat" double precision NOT NULL,
	"long" double precision NOT NULL,
	"area_fk" integer,
	"block_fk" integer
);
--> statement-breakpoint
ALTER TABLE "geolocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "grades" (
	"id" serial PRIMARY KEY NOT NULL,
	"FB" text,
	"V" text
);
--> statement-breakpoint
ALTER TABLE "grades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth_user_fk" uuid NOT NULL,
	"user_fk" integer NOT NULL,
	"endpoint" text NOT NULL,
	"expiration_time" integer,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"lang" text
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "region_invitations" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"token" uuid NOT NULL,
	"invited_by" integer NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" integer,
	CONSTRAINT "region_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "region_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "region_members" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"role" "app_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"auth_user_fk" uuid NOT NULL,
	"invited_by" integer,
	"user_fk" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "region_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "regions" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"created_by" integer NOT NULL,
	"max_members" integer DEFAULT 10 NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb
);
--> statement-breakpoint
ALTER TABLE "regions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" "app_role" NOT NULL,
	"permission" "app_permission" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "route_external_resource_27crags" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"name" text,
	"searchable_id" integer,
	"searchable_type" text,
	"country_name" text,
	"location_name" text,
	"description" text,
	"crag_id" integer,
	"latitude" real,
	"longitude" real,
	"path" text,
	"url" text,
	"external_resources_fk" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "route_external_resource_27crags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "route_external_resource_8a" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"zlaggable_name" text,
	"zlaggable_slug" text,
	"zlaggable_id" integer,
	"crag_name" text,
	"crag_slug" text,
	"country_slug" text,
	"country_name" text,
	"area_name" text,
	"area_slug" text,
	"sector_name" text,
	"sector_slug" text,
	"grade_index" integer,
	"type" integer,
	"category" integer,
	"average_rating" real,
	"difficulty" text,
	"url" text,
	"external_resources_fk" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "route_external_resource_8a" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "route_external_resource_the_crag" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"name" text,
	"description" text,
	"grade" text,
	"node" bigint,
	"rating" integer,
	"tags" text,
	"url" text,
	"external_resources_fk" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "route_external_resource_the_crag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "route_external_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"route_fk" integer NOT NULL,
	"external_resource_8a_fk" integer,
	"external_resource_27crags_fk" integer,
	"external_resource_the_crag_fk" integer
);
--> statement-breakpoint
ALTER TABLE "route_external_resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routes" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"created_by" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"region_fk" integer NOT NULL,
	"description" text,
	"rating" integer,
	"first_ascent_year" integer,
	"user_rating" integer,
	"area_fks" integer[],
	"area_ids" text,
	"block_fk" integer NOT NULL,
	"external_resources_fk" integer,
	"grade_fk" integer,
	"user_grade_fk" integer
);
--> statement-breakpoint
ALTER TABLE "routes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routes_to_first_ascensionists" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"first_ascensionist_fk" integer NOT NULL,
	"route_fk" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routes_to_first_ascensionists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routes_to_tags" (
	"region_fk" integer NOT NULL,
	"route_fk" integer NOT NULL,
	"tag_fk" text NOT NULL,
	CONSTRAINT "routes_to_tags_route_fk_tag_fk_pk" PRIMARY KEY("route_fk","tag_fk")
);
--> statement-breakpoint
ALTER TABLE "routes_to_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "topo_routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"top_type" text NOT NULL,
	"path" text,
	"route_fk" integer,
	"topo_fk" integer
);
--> statement-breakpoint
ALTER TABLE "topo_routes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "topos" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"block_fk" integer,
	"file_fk" text
);
--> statement-breakpoint
ALTER TABLE "topos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth_user_fk" uuid NOT NULL,
	"role" "app_role" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth_user_fk" uuid NOT NULL,
	"user_fk" integer NOT NULL,
	"cookie_8a" text,
	"cookie_27crags" text,
	"cookie_the_crag" text,
	"grading_scale" text DEFAULT 'FB' NOT NULL,
	"notify_moderations" boolean DEFAULT false NOT NULL,
	"notify_new_ascents" boolean DEFAULT false NOT NULL,
	"notify_new_users" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"auth_user_fk" uuid NOT NULL,
	"first_ascentionist_fk" integer,
	"user_settings_fk" integer
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_fk_users_id_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_parent_fk_areas_id_fk" FOREIGN KEY ("parent_fk") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ascents" ADD CONSTRAINT "ascents_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ascents" ADD CONSTRAINT "ascents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ascents" ADD CONSTRAINT "ascents_grade_fk_grades_id_fk" FOREIGN KEY ("grade_fk") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ascents" ADD CONSTRAINT "ascents_route_fk_routes_id_fk" FOREIGN KEY ("route_fk") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_area_fk_areas_id_fk" FOREIGN KEY ("area_fk") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_geolocation_fk_geolocations_id_fk" FOREIGN KEY ("geolocation_fk") REFERENCES "public"."geolocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bunny_streams" ADD CONSTRAINT "bunny_streams_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bunny_streams" ADD CONSTRAINT "bunny_streams_file_fk_files_id_fk" FOREIGN KEY ("file_fk") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_error_logs" ADD CONSTRAINT "client_error_logs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_fk_users_id_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_area_fk_areas_id_fk" FOREIGN KEY ("area_fk") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_ascent_fk_ascents_id_fk" FOREIGN KEY ("ascent_fk") REFERENCES "public"."ascents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_block_fk_blocks_id_fk" FOREIGN KEY ("block_fk") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_bunny_stream_fk_bunny_streams_id_fk" FOREIGN KEY ("bunny_stream_fk") REFERENCES "public"."bunny_streams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_route_fk_routes_id_fk" FOREIGN KEY ("route_fk") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "first_ascensionists" ADD CONSTRAINT "first_ascensionists_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "first_ascensionists" ADD CONSTRAINT "first_ascensionists_user_fk_users_id_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geolocations" ADD CONSTRAINT "geolocations_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geolocations" ADD CONSTRAINT "geolocations_area_fk_areas_id_fk" FOREIGN KEY ("area_fk") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geolocations" ADD CONSTRAINT "geolocations_block_fk_blocks_id_fk" FOREIGN KEY ("block_fk") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_fk_users_id_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_invitations" ADD CONSTRAINT "region_invitations_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_invitations" ADD CONSTRAINT "region_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_invitations" ADD CONSTRAINT "region_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_members" ADD CONSTRAINT "region_members_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_members" ADD CONSTRAINT "region_members_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_members" ADD CONSTRAINT "region_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_members" ADD CONSTRAINT "region_members_user_fk_users_id_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resource_27crags" ADD CONSTRAINT "route_external_resource_27crags_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resource_27crags" ADD CONSTRAINT "route_external_resource_27crags_external_resources_fk_route_external_resources_id_fk" FOREIGN KEY ("external_resources_fk") REFERENCES "public"."route_external_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resource_8a" ADD CONSTRAINT "route_external_resource_8a_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resource_8a" ADD CONSTRAINT "route_external_resource_8a_external_resources_fk_route_external_resources_id_fk" FOREIGN KEY ("external_resources_fk") REFERENCES "public"."route_external_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resource_the_crag" ADD CONSTRAINT "route_external_resource_the_crag_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resource_the_crag" ADD CONSTRAINT "route_external_resource_the_crag_external_resources_fk_route_external_resources_id_fk" FOREIGN KEY ("external_resources_fk") REFERENCES "public"."route_external_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resources" ADD CONSTRAINT "route_external_resources_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resources" ADD CONSTRAINT "route_external_resources_route_fk_routes_id_fk" FOREIGN KEY ("route_fk") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resources" ADD CONSTRAINT "route_external_resources_external_resource_8a_fk_route_external_resource_8a_id_fk" FOREIGN KEY ("external_resource_8a_fk") REFERENCES "public"."route_external_resource_8a"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resources" ADD CONSTRAINT "route_external_resources_external_resource_27crags_fk_route_external_resource_27crags_id_fk" FOREIGN KEY ("external_resource_27crags_fk") REFERENCES "public"."route_external_resource_27crags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_external_resources" ADD CONSTRAINT "route_external_resources_external_resource_the_crag_fk_route_external_resource_the_crag_id_fk" FOREIGN KEY ("external_resource_the_crag_fk") REFERENCES "public"."route_external_resource_the_crag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_block_fk_blocks_id_fk" FOREIGN KEY ("block_fk") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_external_resources_fk_route_external_resources_id_fk" FOREIGN KEY ("external_resources_fk") REFERENCES "public"."route_external_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_grade_fk_grades_id_fk" FOREIGN KEY ("grade_fk") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_user_grade_fk_grades_id_fk" FOREIGN KEY ("user_grade_fk") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes_to_first_ascensionists" ADD CONSTRAINT "routes_to_first_ascensionists_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes_to_first_ascensionists" ADD CONSTRAINT "routes_to_first_ascensionists_first_ascensionist_fk_first_ascensionists_id_fk" FOREIGN KEY ("first_ascensionist_fk") REFERENCES "public"."first_ascensionists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes_to_first_ascensionists" ADD CONSTRAINT "routes_to_first_ascensionists_route_fk_routes_id_fk" FOREIGN KEY ("route_fk") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes_to_tags" ADD CONSTRAINT "routes_to_tags_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes_to_tags" ADD CONSTRAINT "routes_to_tags_route_fk_routes_id_fk" FOREIGN KEY ("route_fk") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes_to_tags" ADD CONSTRAINT "routes_to_tags_tag_fk_tags_id_fk" FOREIGN KEY ("tag_fk") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topo_routes" ADD CONSTRAINT "topo_routes_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topo_routes" ADD CONSTRAINT "topo_routes_route_fk_routes_id_fk" FOREIGN KEY ("route_fk") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topo_routes" ADD CONSTRAINT "topo_routes_topo_fk_topos_id_fk" FOREIGN KEY ("topo_fk") REFERENCES "public"."topos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topos" ADD CONSTRAINT "topos_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topos" ADD CONSTRAINT "topos_block_fk_blocks_id_fk" FOREIGN KEY ("block_fk") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topos" ADD CONSTRAINT "topos_file_fk_files_id_fk" FOREIGN KEY ("file_fk") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_fk_users_id_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_first_ascentionist_fk_first_ascensionists_id_fk" FOREIGN KEY ("first_ascentionist_fk") REFERENCES "public"."first_ascensionists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_user_settings_fk_user_settings_id_fk" FOREIGN KEY ("user_settings_fk") REFERENCES "public"."user_settings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_created_at_idx" ON "activities" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activities_entity_id_idx" ON "activities" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "activities_entity_type_idx" ON "activities" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "activities_notified_idx" ON "activities" USING btree ("notified");--> statement-breakpoint
CREATE INDEX "activities_parent_entity_id_idx" ON "activities" USING btree ("parent_entity_id");--> statement-breakpoint
CREATE INDEX "activities_type_idx" ON "activities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "activities_user_fk_idx" ON "activities" USING btree ("user_fk");--> statement-breakpoint
CREATE INDEX "activities_region_fk_idx" ON "activities" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "areas_description_idx" ON "areas" USING btree ("description");--> statement-breakpoint
CREATE INDEX "areas_region_fk_idx" ON "areas" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "areas_slug_idx" ON "areas" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ascents_created_by_idx" ON "ascents" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "ascents_notes_idx" ON "ascents" USING btree ("notes");--> statement-breakpoint
CREATE INDEX "ascents_region_fk_idx" ON "ascents" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "ascents_route_fk_idx" ON "ascents" USING btree ("route_fk");--> statement-breakpoint
CREATE INDEX "blocks_region_fk_idx" ON "blocks" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "blocks_slug_idx" ON "blocks" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "blocks_geolocation_fk_idx" ON "blocks" USING btree ("geolocation_fk");--> statement-breakpoint
CREATE INDEX "bunny_streams_region_fk_idx" ON "bunny_streams" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "bunny_streams_file_fk_idx" ON "bunny_streams" USING btree ("file_fk");--> statement-breakpoint
CREATE INDEX "favorites_created_at_idx" ON "favorites" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "favorites_entity_id_idx" ON "favorites" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "favorites_entity_type_idx" ON "favorites" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "files_area_fk_idx" ON "files" USING btree ("area_fk");--> statement-breakpoint
CREATE INDEX "files_ascent_fk_idx" ON "files" USING btree ("ascent_fk");--> statement-breakpoint
CREATE INDEX "files_block_fk_idx" ON "files" USING btree ("block_fk");--> statement-breakpoint
CREATE INDEX "files_region_fk_idx" ON "files" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "files_route_fk_idx" ON "files" USING btree ("route_fk");--> statement-breakpoint
CREATE INDEX "first_ascensionists_name_idx" ON "first_ascensionists" USING btree ("name");--> statement-breakpoint
CREATE INDEX "first_ascensionists_region_fk_idx" ON "first_ascensionists" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "first_ascensionists_user_fk_idx" ON "first_ascensionists" USING btree ("user_fk");--> statement-breakpoint
CREATE INDEX "geolocations_area_fk_idx" ON "geolocations" USING btree ("area_fk");--> statement-breakpoint
CREATE INDEX "geolocations_block_fk_idx" ON "geolocations" USING btree ("block_fk");--> statement-breakpoint
CREATE INDEX "geolocations_region_fk_idx" ON "geolocations" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "push_subscriptions_auth_user_fk_idx" ON "push_subscriptions" USING btree ("auth_user_fk");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_fk_idx" ON "push_subscriptions" USING btree ("user_fk");--> statement-breakpoint
CREATE INDEX "region_invitations_token_idx" ON "region_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "region_invitations_region_fk_idx" ON "region_invitations" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "region_invitations_email_idx" ON "region_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "region_invitations_status_idx" ON "region_invitations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "region_members_auth_user_fk_idx" ON "region_members" USING btree ("auth_user_fk");--> statement-breakpoint
CREATE INDEX "region_members_region_fk_idx" ON "region_members" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "region_members_user_fk_idx" ON "region_members" USING btree ("user_fk");--> statement-breakpoint
CREATE INDEX "region_members_region_auth_user_idx" ON "region_members" USING btree ("region_fk","auth_user_fk");--> statement-breakpoint
CREATE INDEX "regions_name_idx" ON "regions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "route_external_resources_route_fk_idx" ON "route_external_resources" USING btree ("route_fk");--> statement-breakpoint
CREATE INDEX "route_external_resources_region_fk_idx" ON "route_external_resources" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "routes_block_fk_idx" ON "routes" USING btree ("block_fk");--> statement-breakpoint
CREATE INDEX "routes_description_idx" ON "routes" USING btree ("description");--> statement-breakpoint
CREATE INDEX "routes_region_fk_idx" ON "routes" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "routes_slug_idx" ON "routes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "routes_area_fks_gin_idx" ON "routes" USING gin ("area_fks");--> statement-breakpoint
CREATE INDEX "routes_area_ids_idx" ON "routes" USING btree ("area_ids");--> statement-breakpoint
CREATE INDEX "routes_grade_fk_idx" ON "routes" USING btree ("grade_fk");--> statement-breakpoint
CREATE INDEX "routes_user_grade_fk_idx" ON "routes" USING btree ("user_grade_fk");--> statement-breakpoint
CREATE INDEX "routes_rating_idx" ON "routes" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "routes_first_ascent_year_idx" ON "routes" USING btree ("first_ascent_year");--> statement-breakpoint
CREATE INDEX "routes_created_by_idx" ON "routes" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "routes_to_first_ascensionists_first_ascensionist_fk_idx" ON "routes_to_first_ascensionists" USING btree ("first_ascensionist_fk");--> statement-breakpoint
CREATE INDEX "routes_to_first_ascensionists_route_fk_idx" ON "routes_to_first_ascensionists" USING btree ("route_fk");--> statement-breakpoint
CREATE INDEX "routes_to_tags_region_fk_idx" ON "routes_to_tags" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "routes_to_tags_route_fk_idx" ON "routes_to_tags" USING btree ("route_fk");--> statement-breakpoint
CREATE INDEX "routes_to_tags_tag_fk_idx" ON "routes_to_tags" USING btree ("tag_fk");--> statement-breakpoint
CREATE INDEX "topo_routes_region_fk_idx" ON "topo_routes" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "topo_routes_route_fk_idx" ON "topo_routes" USING btree ("route_fk");--> statement-breakpoint
CREATE INDEX "topo_routes_topo_fk_idx" ON "topo_routes" USING btree ("topo_fk");--> statement-breakpoint
CREATE INDEX "topos_block_fk_idx" ON "topos" USING btree ("block_fk");--> statement-breakpoint
CREATE INDEX "topos_region_fk_idx" ON "topos" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "topos_file_fk_idx" ON "topos" USING btree ("file_fk");--> statement-breakpoint
CREATE INDEX "user_settings_auth_user_fk_idx" ON "user_settings" USING btree ("auth_user_fk");--> statement-breakpoint
CREATE INDEX "user_settings_user_fk_idx" ON "user_settings" USING btree ("user_fk");--> statement-breakpoint
CREATE INDEX "users_auth_user_fk_idx" ON "users" USING btree ("auth_user_fk");--> statement-breakpoint
CREATE INDEX "users_first_ascentionist_fk_idx" ON "users" USING btree ("first_ascentionist_fk");--> statement-breakpoint
CREATE INDEX "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
-- ============================================================================
-- Auth / RLS helper functions.
--
-- These were historically applied to the database out-of-band (never captured
-- in a migration), so a from-empty `migrate` could not build a working DB: the
-- RLS policies below call authorize()/authorize_in_region(), and GoTrue calls
-- custom_access_token_hook() to inject the user_role claim. They are folded into
-- this squashed baseline, right before the policies that depend on them, so a
-- fresh Supabase can be provisioned with a single `npm run migrate`.
-- ============================================================================
CREATE FUNCTION public.authorize(requested_permission public.app_permission) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  declare
    bind_permissions int;
    user_role public.app_role;
    user_id uuid;
  begin
    select (auth.jwt() ->> 'sub')::uuid into user_id;

    select role into user_role from public.user_roles where user_roles.auth_user_fk = user_id;

    select count(*)
    into bind_permissions
    from public.role_permissions
    where role_permissions.permission = requested_permission
      and role_permissions.role = user_role;

    return bind_permissions > 0;
  end;
$$;
--> statement-breakpoint
CREATE FUNCTION public.authorize_in_region(requested_permission public.app_permission, region_id integer) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  declare
    bind_permissions int;
    user_role public.app_role;
    region_role public.app_role;
    user_id uuid;
  begin
    -- Get user ID from JWT
    select (auth.jwt() ->> 'sub')::uuid into user_id;

    select role into region_role
    from public.region_members
    where auth_user_fk = user_id
      and region_fk = region_id
      and is_active = true;

    if region_role is null then
      return false;
    end if;

    -- Check if this role has the requested permission
    select count(*)
    into bind_permissions
    from public.role_permissions
    where permission = requested_permission
      and role = region_role;

    return bind_permissions > 0;
  end;
$$;
--> statement-breakpoint
CREATE FUNCTION public.custom_access_token_hook(event jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $$
  declare
    claims jsonb;
    user_role public.app_role;
  begin
    -- Fetch the user role in the user_roles table
    select role into user_role from public.user_roles where auth_user_fk = (event->>'user_id')::uuid;

    claims := event->'claims';

    if user_role is null then
      claims := jsonb_set(claims, '{user_role}', 'null');
    else
      -- Set the claim
      claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
    end if;

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);

    -- Return the modified or original event
    return event;
  end;
$$;
--> statement-breakpoint
GRANT ALL ON FUNCTION public.authorize(requested_permission public.app_permission) TO anon;--> statement-breakpoint
GRANT ALL ON FUNCTION public.authorize(requested_permission public.app_permission) TO authenticated;--> statement-breakpoint
GRANT ALL ON FUNCTION public.authorize(requested_permission public.app_permission) TO service_role;--> statement-breakpoint
GRANT ALL ON FUNCTION public.authorize_in_region(requested_permission public.app_permission, region_id integer) TO anon;--> statement-breakpoint
GRANT ALL ON FUNCTION public.authorize_in_region(requested_permission public.app_permission, region_id integer) TO authenticated;--> statement-breakpoint
GRANT ALL ON FUNCTION public.authorize_in_region(requested_permission public.app_permission, region_id integer) TO service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.custom_access_token_hook(event jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT ALL ON FUNCTION public.custom_access_token_hook(event jsonb) TO service_role;--> statement-breakpoint
GRANT ALL ON FUNCTION public.custom_access_token_hook(event jsonb) TO supabase_auth_admin;--> statement-breakpoint
-- Table/schema grants the token hook needs: it runs as supabase_auth_admin and
-- reads these tables to resolve the user_role claim. (Historically applied
-- out-of-band; folded in here so a fresh DB can authenticate.)
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;--> statement-breakpoint
GRANT ALL ON TABLE public.user_roles TO supabase_auth_admin;--> statement-breakpoint
GRANT ALL ON TABLE public.region_members TO supabase_auth_admin;--> statement-breakpoint
GRANT ALL ON TABLE public.role_permissions TO supabase_auth_admin;
--> statement-breakpoint
CREATE POLICY "region.read can insert activities" ON "activities" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read activities" ON "activities" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete activities" ON "activities" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can delete their own activities" ON "activities" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can read areas" ON "areas" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert areas" ON "areas" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update areas" ON "areas" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete areas" ON "areas" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can delete areas" ON "areas" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can update areas" ON "areas" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can insert ascents" ON "ascents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read ascents" ON "ascents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can update their own ascents" ON "ascents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = created_by
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        ) WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = created_by
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can delete their own ascents" ON "ascents" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = created_by
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.admin can fully access ascents" ON "ascents" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize_in_region('region.admin', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.admin', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read blocks" ON "blocks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert blocks" ON "blocks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update blocks" ON "blocks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete blocks" ON "blocks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can delete blocks" ON "blocks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can update blocks" ON "blocks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can insert bunny_streams" ON "bunny_streams" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read bunny_streams" ON "bunny_streams" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can update bunny_streams for files of their own ascents" ON "bunny_streams" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.files f
              JOIN public.ascents a ON f.ascent_fk = a.id
              JOIN public.users u ON a.created_by = u.id
            WHERE
              f.id = file_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        ) WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.files f
              JOIN public.ascents a ON f.ascent_fk = a.id
              JOIN public.users u ON a.created_by = u.id
            WHERE
              f.id = file_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can delete bunny_streams for files of their own ascents" ON "bunny_streams" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.files f
              JOIN public.ascents a ON f.ascent_fk = a.id
              JOIN public.users u ON a.created_by = u.id
            WHERE
              f.id = file_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.admin can fully access bunny_streams" ON "bunny_streams" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize_in_region('region.admin', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.admin', region_fk)));--> statement-breakpoint
CREATE POLICY "users can insert own favorites" ON "favorites" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "region.read can read favorites" ON "favorites" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "users can update own favorites" ON "favorites" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk) WITH CHECK ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can delete own favorites" ON "favorites" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "region.read can insert files" ON "files" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read files" ON "files" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update files" ON "files" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can delete files" ON "files" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can update files belonging to their own ascents" ON "files" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        ) WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can delete files belonging to their own ascents" ON "files" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('region.read', region_fk))
        );--> statement-breakpoint
CREATE POLICY "region.read can fully access first_ascensionists" ON "first_ascensionists" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read geolocations" ON "geolocations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert geolocations" ON "geolocations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update geolocations" ON "geolocations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete geolocations" ON "geolocations" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can insert geolocations" ON "geolocations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can delete geolocations" ON "geolocations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "authenticated users can read grades" ON "grades" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "users can delete own push_subscriptions" ON "push_subscriptions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can insert own push_subscriptions" ON "push_subscriptions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can read own push_subscriptions" ON "push_subscriptions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can update own push_subscriptions" ON "push_subscriptions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk) WITH CHECK ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "region.admin can insert region_invitations" ON "region_invitations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.admin', region_fk)));--> statement-breakpoint
CREATE POLICY "users can read region_invitations" ON "region_invitations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "users can update region_invitations" ON "region_invitations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "app.admin can fully access region_members" ON "region_members" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize('app.admin'))) WITH CHECK ((SELECT authorize('app.admin')));--> statement-breakpoint
CREATE POLICY "authenticated users can read region_members" ON "region_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "users can insert own region_members" ON "region_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can update own region_members" ON "region_members" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk) WITH CHECK ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can delete own region_members" ON "region_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "authenticated users can create regions" ON "regions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "app.admin can fully access regions" ON "regions" AS PERMISSIVE FOR ALL TO "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "users can read regions they are members of" ON "regions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              region_members as rm
            WHERE
              rm.region_fk = regions.id
              AND rm.auth_user_fk = (SELECT auth.uid())
              AND rm.is_active = true
          )
        );--> statement-breakpoint
CREATE POLICY "region.admin can update region that they are members of" ON "regions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              region_members as rm
            WHERE
              rm.region_fk = regions.id
              AND rm.auth_user_fk = (SELECT auth.uid())
              AND rm.is_active = true
          )
        );--> statement-breakpoint
CREATE POLICY "authenticated users can read role_permissions" ON "role_permissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "region.read can read route_external_resource_27crags" ON "route_external_resource_27crags" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert route_external_resource_27crags" ON "route_external_resource_27crags" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update route_external_resource_27crags" ON "route_external_resource_27crags" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete route_external_resource_27crags" ON "route_external_resource_27crags" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read route_external_resource_8a" ON "route_external_resource_8a" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert route_external_resource_8a" ON "route_external_resource_8a" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update route_external_resource_8a" ON "route_external_resource_8a" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete route_external_resource_8a" ON "route_external_resource_8a" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read route_external_resource_the_crag" ON "route_external_resource_the_crag" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert route_external_resource_the_crag" ON "route_external_resource_the_crag" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update route_external_resource_the_crag" ON "route_external_resource_the_crag" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete route_external_resource_the_crag" ON "route_external_resource_the_crag" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read route_external_resources" ON "route_external_resources" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert route_external_resources" ON "route_external_resources" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update route_external_resources" ON "route_external_resources" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete route_external_resources" ON "route_external_resources" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read routes" ON "routes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert routes" ON "routes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update routes" ON "routes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete routes" ON "routes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can delete routes" ON "routes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can update routes" ON "routes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can fully access routes_to_first_ascensionists" ON "routes_to_first_ascensionists" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read routes_to_tags" ON "routes_to_tags" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert routes_to_tags" ON "routes_to_tags" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update routes_to_tags" ON "routes_to_tags" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete routes_to_tags" ON "routes_to_tags" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can delete routes_to_tags" ON "routes_to_tags" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "app.admin can fully access tags" ON "tags" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize('app.admin'))) WITH CHECK ((SELECT authorize('app.admin')));--> statement-breakpoint
CREATE POLICY "authenticated users can read tags" ON "tags" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "region.read can read topo_routes" ON "topo_routes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert topo_routes" ON "topo_routes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update topo_routes" ON "topo_routes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete topo_routes" ON "topo_routes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can delete topo_routes" ON "topo_routes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.read can read topos" ON "topos" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can insert topos" ON "topos" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can update topos" ON "topos" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk))) WITH CHECK ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "region.delete can delete topos" ON "topos" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.delete', region_fk)));--> statement-breakpoint
CREATE POLICY "region.edit can delete topos" ON "topos" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize_in_region('region.edit', region_fk)));--> statement-breakpoint
CREATE POLICY "auth admins can read user_roles" ON "user_roles" AS PERMISSIVE FOR SELECT TO "supabase_auth_admin" USING (true);--> statement-breakpoint
CREATE POLICY "users can read own user_roles" ON "user_roles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can insert own users_settings" ON "user_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can read own users_settings" ON "user_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can update own users_settings" ON "user_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk) WITH CHECK ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "authenticated users can read users" ON "users" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "users can update own users" ON "users" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk) WITH CHECK ((SELECT auth.uid()) = auth_user_fk);