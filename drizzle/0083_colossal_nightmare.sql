DROP POLICY "users can read region_invitations" ON "region_invitations" CASCADE;--> statement-breakpoint
DROP POLICY "users can update region_invitations" ON "region_invitations" CASCADE;--> statement-breakpoint
DROP POLICY "users can insert own region_members" ON "region_members" CASCADE;--> statement-breakpoint
DROP POLICY "users can update own region_members" ON "region_members" CASCADE;--> statement-breakpoint
DROP POLICY "region.admin can update region that they are members of" ON "regions" CASCADE;--> statement-breakpoint
ALTER POLICY "app.admin can fully access regions" ON "regions" TO authenticated USING ((SELECT authorize('app.admin'))) WITH CHECK ((SELECT authorize('app.admin')));