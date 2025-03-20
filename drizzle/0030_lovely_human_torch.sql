ALTER TABLE "activities" ADD COLUMN "notified" boolean;--> statement-breakpoint
CREATE INDEX "activities_notified_idx" ON "activities" USING btree ("notified");