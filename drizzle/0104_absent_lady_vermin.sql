DROP INDEX "notifications_source_idx";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "event_fk" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "reaction_fk" integer;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_comments" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_reactions" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_fk_events_id_fk" FOREIGN KEY ("event_fk") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reaction_fk_reactions_id_fk" FOREIGN KEY ("reaction_fk") REFERENCES "public"."reactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_source_idx" ON "notifications" USING btree ("user_fk","source_type","entity_type","entity_id","actor_fk",coalesce("event_fk", 0));