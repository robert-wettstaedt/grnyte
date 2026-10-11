-- Keep the newest row per route: the editor reads the last one, so that is the line people see.
DELETE FROM "topo_routes" "t" USING "topo_routes" "k" WHERE "t"."topo_fk" = "k"."topo_fk" AND "t"."route_fk" = "k"."route_fk" AND "t"."id" < "k"."id";--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "topos" WHERE "file_fk" IS NOT NULL GROUP BY "file_fk" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'topos share a file_fk: resolve by hand before this migration (deleting a topo deletes its lines)';
  END IF;
END $$;--> statement-breakpoint
DROP INDEX "topo_routes_topo_fk_idx";--> statement-breakpoint
DROP INDEX "topos_file_fk_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "topo_routes_topo_fk_route_fk_idx" ON "topo_routes" USING btree ("topo_fk","route_fk");--> statement-breakpoint
CREATE UNIQUE INDEX "topos_file_fk_idx" ON "topos" USING btree ("file_fk");