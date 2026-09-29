/**
 * Recompute `routes.user_grade_fk` / `user_rating` for every route under the
 * one-vote-per-user rule (the route's own grade/rating plus, per field, each
 * user's most recent ascent carrying that opinion). The previous logic averaged
 * every ascent, letting one user's repeats dominate, so all routes are
 * recomputed once.
 *
 * Ran once at the v2 cutover, from `migrate.ts`. Idempotent: the UPDATE
 * only touches rows whose values change.
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { pathToFileURL } from 'node:url'
import Database from 'postgres'
import drizzleConfig from '../../../../drizzle.config'
import { recalcUserGradeAndRating } from '../../entities/route/user-grade.server'
import * as schema from '../schema'

export const migrate = async (db: PostgresJsDatabase<typeof schema>) => {
  await recalcUserGradeAndRating(db)
}

// Standalone: `npx tsx src/lib/db/scripts/migrate-user-grades.ts`.
if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // No preview exists, so refuse the flag rather than run for real behind it.
  if (process.argv.includes('--dry-run')) throw new Error('migrate-user-grades has no --dry-run: it always writes')
  const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
  await migrate(drizzle(postgres, { schema }))
  await postgres.end()
}
