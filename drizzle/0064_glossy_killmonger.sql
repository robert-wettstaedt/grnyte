CREATE INDEX "blocks_geolocation_fk_idx" ON "blocks" USING btree ("geolocation_fk");--> statement-breakpoint
CREATE INDEX "routes_area_ids_idx" ON "routes" USING btree ("area_ids");