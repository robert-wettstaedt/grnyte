ALTER TABLE "regions" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "authenticated users can create regions" ON "regions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "region.admin can update region that they are members of" ON "regions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              region_members as rm
            WHERE
              rm.region_fk = regions.id
              AND rm.auth_user_fk = (SELECT auth.uid())
              AND rm.is_active = true
          )
        );