CREATE TABLE "auth_code_attempts" (
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"tries" smallint DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_code_attempts_subject_kind_pk" PRIMARY KEY("subject","kind")
);
--> statement-breakpoint
ALTER TABLE "auth_code_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth_events" (
	"auth_user_fk" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" jsonb,
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auth_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reauth_challenges" (
	"action" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"auth_user_fk" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"target" text NOT NULL,
	CONSTRAINT "reauth_challenges_auth_user_fk_session_id_action_target_unique" UNIQUE("auth_user_fk","session_id","action","target")
);
--> statement-breakpoint
ALTER TABLE "reauth_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reauth_grants" (
	"action" text NOT NULL,
	"auth_user_fk" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"method" text NOT NULL,
	"session_id" uuid NOT NULL,
	"target" text NOT NULL,
	CONSTRAINT "reauth_grants_auth_user_fk_session_id_action_target_unique" UNIQUE("auth_user_fk","session_id","action","target")
);
--> statement-breakpoint
ALTER TABLE "reauth_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reauth_challenges" ADD CONSTRAINT "reauth_challenges_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reauth_grants" ADD CONSTRAINT "reauth_grants_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_events_kind_created_at_idx" ON "auth_events" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "auth_events_auth_user_fk_idx" ON "auth_events" USING btree ("auth_user_fk");