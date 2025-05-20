DROP POLICY "data.read can read areas" ON "areas" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert areas" ON "areas" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update areas" ON "areas" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete areas" ON "areas" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read blocks" ON "blocks" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert blocks" ON "blocks" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update blocks" ON "blocks" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete blocks" ON "blocks" CASCADE;--> statement-breakpoint
DROP POLICY "data.read can read routes" ON "routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can insert routes" ON "routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.edit can update routes" ON "routes" CASCADE;--> statement-breakpoint
DROP POLICY "data.delete can delete routes" ON "routes" CASCADE;--> statement-breakpoint
CREATE POLICY "data.read can read areas in region" ON "areas" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize('data.read')) OR authorize_in_region('data.edit', region_fk));--> statement-breakpoint
CREATE POLICY "data.edit can insert areas in region" ON "areas" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize('data.edit')) OR authorize_in_region('data.edit', region_fk));--> statement-breakpoint
CREATE POLICY "data.edit can update areas in region" ON "areas" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize('data.edit')) OR authorize_in_region('data.edit', region_fk)) WITH CHECK ((SELECT authorize('data.edit')) OR authorize_in_region('data.edit', region_fk));--> statement-breakpoint
CREATE POLICY "data.delete can delete areas in region" ON "areas" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize('data.delete')) OR authorize_in_region('data.delete', region_fk));--> statement-breakpoint
CREATE POLICY "data.read can read blocks in region" ON "blocks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize('data.read')) OR authorize_in_region('data.edit', region_fk));--> statement-breakpoint
CREATE POLICY "data.edit can insert blocks in region" ON "blocks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize('data.edit')) OR authorize_in_region('data.edit', region_fk));--> statement-breakpoint
CREATE POLICY "data.edit can update blocks in region" ON "blocks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize('data.edit')) OR authorize_in_region('data.edit', region_fk)) WITH CHECK ((SELECT authorize('data.edit')) OR authorize_in_region('data.edit', region_fk));--> statement-breakpoint
CREATE POLICY "data.delete can delete blocks in region" ON "blocks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize('data.delete')) OR authorize_in_region('data.delete', region_fk));--> statement-breakpoint
CREATE POLICY "data.read can read routes in region" ON "routes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize('data.read')) OR authorize_in_region('data.edit', region_fk));--> statement-breakpoint
CREATE POLICY "data.edit can insert routes in region" ON "routes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize('data.edit')) OR authorize_in_region('data.edit', region_fk));--> statement-breakpoint
CREATE POLICY "data.edit can update routes in region" ON "routes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize('data.edit')) OR authorize_in_region('data.edit', region_fk)) WITH CHECK ((SELECT authorize('data.edit')) OR authorize_in_region('data.edit', region_fk));--> statement-breakpoint
CREATE POLICY "data.delete can delete routes in region" ON "routes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize('data.delete')) OR authorize_in_region('data.delete', region_fk));