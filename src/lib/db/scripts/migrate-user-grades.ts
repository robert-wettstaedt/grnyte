import { updateRoutesUserData } from '$lib/routes.server'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'

export const migrate = async (db: PostgresJsDatabase<typeof schema>) => {
  const ascents = await db.query.ascents.findMany()
  const routeIds = Array.from(new Set(ascents.map((ascent) => ascent.routeFk)))

  await Promise.all(routeIds.map((routeId) => updateRoutesUserData(routeId, db)))
}
