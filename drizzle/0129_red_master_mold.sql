ALTER TABLE "client_error_logs" DROP CONSTRAINT "client_error_logs_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "client_error_logs" ADD CONSTRAINT "client_error_logs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;