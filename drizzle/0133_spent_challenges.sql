CREATE TABLE "spent_challenges" (
	"expires_at" timestamp with time zone NOT NULL,
	"nonce" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spent_challenges" ENABLE ROW LEVEL SECURITY;