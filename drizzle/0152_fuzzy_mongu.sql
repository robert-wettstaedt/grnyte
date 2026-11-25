CREATE TABLE "applied_writes" (
	"auth_user_fk" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"result" jsonb
);
--> statement-breakpoint
ALTER TABLE "applied_writes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applied_writes" ADD CONSTRAINT "applied_writes_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applied_writes_created_at_idx" ON "applied_writes" USING btree ("created_at");