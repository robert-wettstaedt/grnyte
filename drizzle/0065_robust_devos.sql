CREATE TABLE "client_error_logs" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"created_by" integer,
	"error" text,
	"navigator" jsonb
);
--> statement-breakpoint
ALTER TABLE "client_error_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_error_logs" ADD CONSTRAINT "client_error_logs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;