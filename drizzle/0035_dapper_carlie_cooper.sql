ALTER TABLE "ascents" ALTER COLUMN "date_time" SET DATA TYPE date USING date_time::date;--> statement-breakpoint
ALTER TABLE "ascents" ALTER COLUMN "date_time" SET DEFAULT now();