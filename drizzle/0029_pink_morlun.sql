ALTER TABLE "user_settings" ADD COLUMN "notify_new_users" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_new_ascents" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE POLICY "users can delete own push_subscriptions" ON "push_subscriptions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk);