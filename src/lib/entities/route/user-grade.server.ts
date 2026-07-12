import type * as schema from '$lib/db/schema'
import { sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

/**
 * Recompute `routes.user_grade_fk` / `user_rating`: the mean of the route's own
 * grade/rating plus one vote per user (so nobody sways the consensus by logging
 * the same opinion repeatedly). The vote is per field: a user's grade vote is
 * their most recent ascent that carries a grade opinion, their rating vote their
 * most recent ascent that carries a rating, independently, so logging an
 * opinion-less attempt doesn't erase an earlier opinion. A route with no votes
 * at all ends up NULL.
 *
 * Runs for one route after an ascent/route mutation, or for all routes when
 * `routeId` is omitted (the migration). Only rows whose values actually change
 * are written, so the all-routes pass doesn't churn Zero replication.
 */
export async function recalcUserGradeAndRating(db: PostgresJsDatabase<typeof schema>, routeId?: number): Promise<void> {
  const andAscent = routeId == null ? sql`` : sql`AND route_fk = ${routeId}`
  const andRoute = routeId == null ? sql`` : sql`AND id = ${routeId}`
  const whereRoute = routeId == null ? sql`` : sql`WHERE routes.id = ${routeId}`

  await db.execute(sql`
    WITH grade_votes AS (
      SELECT DISTINCT ON (route_fk, created_by) route_fk, grade_fk AS vote
      FROM ascents
      WHERE grade_fk IS NOT NULL ${andAscent}
      ORDER BY route_fk, created_by, date_time DESC, id DESC
    ),
    rating_votes AS (
      SELECT DISTINCT ON (route_fk, created_by) route_fk, rating AS vote
      FROM ascents
      WHERE rating IS NOT NULL ${andAscent}
      ORDER BY route_fk, created_by, date_time DESC, id DESC
    ),
    grade_agg AS (
      SELECT route_fk, ROUND(AVG(vote))::int AS value
      FROM (
        SELECT route_fk, vote FROM grade_votes
        UNION ALL
        SELECT id, grade_fk FROM routes WHERE grade_fk IS NOT NULL ${andRoute}
      ) votes
      GROUP BY route_fk
    ),
    rating_agg AS (
      SELECT route_fk, ROUND(AVG(vote))::int AS value
      FROM (
        SELECT route_fk, vote FROM rating_votes
        UNION ALL
        SELECT id, rating FROM routes WHERE rating IS NOT NULL ${andRoute}
      ) votes
      GROUP BY route_fk
    ),
    -- Every targeted route appears (LEFT JOINs), so a route whose last vote was
    -- deleted gets its community values cleared back to NULL.
    agg AS (
      SELECT routes.id AS route_fk, grade_agg.value AS grade, rating_agg.value AS rating
      FROM routes
      LEFT JOIN grade_agg ON grade_agg.route_fk = routes.id
      LEFT JOIN rating_agg ON rating_agg.route_fk = routes.id
      ${whereRoute}
    )
    UPDATE routes
    SET user_grade_fk = agg.grade, user_rating = agg.rating
    FROM agg
    WHERE routes.id = agg.route_fk
      AND (routes.user_grade_fk IS DISTINCT FROM agg.grade
        OR routes.user_rating IS DISTINCT FROM agg.rating)
  `)
}
