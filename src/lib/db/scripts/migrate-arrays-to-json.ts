import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'
import { migrate as migrateRouteAreaFks } from './migrate-route-area-fks'

export const migrate = async (db: PostgresJsDatabase<typeof schema>) => {
  await db.transaction(async (tx) => {
    const areas = await tx.query.areas.findMany({
      where: (table, { isNotNull }) => isNotNull(table.walkingPaths),
    })

    await Promise.all(
      areas.map((area) =>
        tx.update(schema.areas).set({ geoPaths: area.walkingPaths }).where(eq(schema.areas.id, area.id)),
      ),
    )
  })

  await migrateRouteAreaFks(db)
}
