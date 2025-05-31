import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'

export const migrate = async (db: PostgresJsDatabase<typeof schema>) => {
  const ascents = await db.query.ascents.findMany()
  const ascentIds = ascents.map((ascent) => String(ascent.id))

  const activities = await db.query.activities.findMany({
    where: (table, { and, eq, inArray }) =>
      and(eq(table.entityType, 'ascent'), eq(table.type, 'created'), inArray(table.entityId, ascentIds)),
  })

  const missingAscents = ascents.filter(
    (ascent) => !activities.some((activity) => activity.entityId === String(ascent.id)),
  )

  await db.insert(schema.activities).values(
    missingAscents.map(
      (ascent): schema.InsertActivity => ({
        createdAt: ascent.createdAt,
        entityId: String(ascent.id),
        entityType: 'ascent',
        parentEntityId: String(ascent.routeFk),
        parentEntityType: 'route',
        regionFk: ascent.regionFk,
        type: 'created',
        userFk: ascent.createdBy,
      }),
    ),
  )
}
