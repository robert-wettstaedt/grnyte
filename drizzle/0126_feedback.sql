CREATE TABLE "feedback" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"created_by" integer NOT NULL,
	"kind" text NOT NULL,
	"locale" text,
	"pathname" text,
	"replied_at" timestamp with time zone,
	"reply" text,
	"status" text DEFAULT 'open' NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;