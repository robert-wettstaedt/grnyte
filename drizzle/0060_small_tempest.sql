CREATE INDEX "routes_area_fks_gin_idx" ON "routes" USING gin ("area_fks");--> statement-breakpoint
CREATE INDEX "routes_grade_fk_idx" ON "routes" USING btree ("grade_fk");--> statement-breakpoint
CREATE INDEX "routes_user_grade_fk_idx" ON "routes" USING btree ("user_grade_fk");--> statement-breakpoint
CREATE INDEX "routes_rating_idx" ON "routes" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "routes_first_ascent_year_idx" ON "routes" USING btree ("first_ascent_year");--> statement-breakpoint
CREATE INDEX "routes_created_by_idx" ON "routes" USING btree ("created_by");