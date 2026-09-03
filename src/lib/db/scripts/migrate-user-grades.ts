/**
 * Recompute `routes.user_grade_fk` / `user_rating` for every route under the
 * one-vote-per-user rule (the route's own grade/rating plus, per field, each
 * user's most recent ascent carrying that opinion). The previous logic averaged
 * every ascent, letting one user's repeats dominate, so all routes are
 * recomputed once.
 *
 * Runs as part of `npm run migrate` (via `migrate.ts`). Idempotent: the UPDATE
 * only touches rows whose values change.
 */
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { recalcUserGradeAndRating } from '../../entities/route/user-grade.server'
import type * as schema from '../schema'

export const migrate = async (db: PostgresJsDatabase<typeof schema>) => {
  await recalcUserGradeAndRating(db)
}
