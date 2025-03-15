-- The original migration had these specific tables that need migration:
-- activities, areas, ascents, blocks, routes, users

-- Table: activities
ALTER TABLE "activities" ADD COLUMN "created_at_temp" timestamp with time zone;--> statement-breakpoint
UPDATE "activities" SET "created_at_temp" = "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "created_at" timestamp with time zone NOT NULL DEFAULT now();--> statement-breakpoint
UPDATE "activities" SET "created_at" = "created_at_temp";--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN "created_at_temp";--> statement-breakpoint

-- Table: areas
ALTER TABLE "areas" ADD COLUMN "created_at_temp" timestamp with time zone;--> statement-breakpoint
UPDATE "areas" SET "created_at_temp" = "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "areas" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "created_at" timestamp with time zone NOT NULL DEFAULT now();--> statement-breakpoint
UPDATE "areas" SET "created_at" = "created_at_temp";--> statement-breakpoint
ALTER TABLE "areas" DROP COLUMN "created_at_temp";--> statement-breakpoint

-- Table: ascents
ALTER TABLE "ascents" ADD COLUMN "created_at_temp" timestamp with time zone;--> statement-breakpoint
UPDATE "ascents" SET "created_at_temp" = "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ascents" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "ascents" ADD COLUMN "created_at" timestamp with time zone NOT NULL DEFAULT now();--> statement-breakpoint
UPDATE "ascents" SET "created_at" = "created_at_temp";--> statement-breakpoint
ALTER TABLE "ascents" DROP COLUMN "created_at_temp";--> statement-breakpoint

-- Table: blocks
ALTER TABLE "blocks" ADD COLUMN "created_at_temp" timestamp with time zone;--> statement-breakpoint
UPDATE "blocks" SET "created_at_temp" = "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "blocks" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "blocks" ADD COLUMN "created_at" timestamp with time zone NOT NULL DEFAULT now();--> statement-breakpoint
UPDATE "blocks" SET "created_at" = "created_at_temp";--> statement-breakpoint
ALTER TABLE "blocks" DROP COLUMN "created_at_temp";--> statement-breakpoint

-- Table: routes
ALTER TABLE "routes" ADD COLUMN "created_at_temp" timestamp with time zone;--> statement-breakpoint
UPDATE "routes" SET "created_at_temp" = "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "routes" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "created_at" timestamp with time zone NOT NULL DEFAULT now();--> statement-breakpoint
UPDATE "routes" SET "created_at" = "created_at_temp";--> statement-breakpoint
ALTER TABLE "routes" DROP COLUMN "created_at_temp";--> statement-breakpoint

-- Table: users
ALTER TABLE "users" ADD COLUMN "created_at_temp" timestamp with time zone;--> statement-breakpoint
UPDATE "users" SET "created_at_temp" = "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "created_at" timestamp with time zone NOT NULL DEFAULT now();--> statement-breakpoint
UPDATE "users" SET "created_at" = "created_at_temp";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "created_at_temp";--> statement-breakpoint