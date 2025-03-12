CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth_user_fk" uuid NOT NULL,
	"user_fk" integer NOT NULL,
	"endpoint" text NOT NULL,
	"expiration_time" integer,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_fk_users_id_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_subscriptions_auth_user_fk_idx" ON "push_subscriptions" USING btree ("auth_user_fk");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_fk_idx" ON "push_subscriptions" USING btree ("user_fk");--> statement-breakpoint
CREATE POLICY "users can insert own push_subscriptions" ON "push_subscriptions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can read own push_subscriptions" ON "push_subscriptions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can update own push_subscriptions" ON "push_subscriptions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk) WITH CHECK ((SELECT auth.uid()) = auth_user_fk);