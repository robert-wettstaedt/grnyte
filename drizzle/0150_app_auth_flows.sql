CREATE TABLE "app_auth_flows" (
	"action" text,
	"auth_user_fk" uuid,
	"claimed_at" timestamp with time zone,
	"client_hash" text,
	"code_challenge" text,
	"code_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce_digest" text,
	"proof" text,
	"provider" text NOT NULL,
	"purpose" text NOT NULL,
	"session_id" uuid,
	"state_hash" text,
	"target" text,
	"transaction" text,
	CONSTRAINT "app_auth_flows_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "app_auth_flows_state_hash_unique" UNIQUE("state_hash")
);
--> statement-breakpoint
ALTER TABLE "app_auth_flows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_auth_flows" ADD CONSTRAINT "app_auth_flows_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_auth_flows_client_idx" ON "app_auth_flows" USING btree ("client_hash","claimed_at","expires_at");