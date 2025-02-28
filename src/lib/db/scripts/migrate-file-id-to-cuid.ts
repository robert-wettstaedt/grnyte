import { createId as createCuid2 } from '@paralleldrive/cuid2'
import { and, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'

export const migrate = async (db: PostgresJsDatabase<typeof schema>) => {
  const files = await db.query.files.findMany()
  await Promise.all(
    files
      .filter((file) => !Number.isNaN(Number(file.id)))
      .map(async (file) => {
        const newId = createCuid2()

        const bunnyStreams = await db.query.bunnyStreams.findMany({ where: eq(schema.bunnyStreams.fileFk, file.id) })
        const topos = await db.query.topos.findMany({ where: eq(schema.topos.fileFk, file.id) })

        await Promise.all(
          bunnyStreams.map((bunnyStream) =>
            db.update(schema.bunnyStreams).set({ fileFk: null }).where(eq(schema.bunnyStreams.id, bunnyStream.id)),
          ),
        )

        await Promise.all(
          topos.map((topo) => db.update(schema.topos).set({ fileFk: null }).where(eq(schema.topos.id, topo.id))),
        )

        await db.update(schema.files).set({ id: newId }).where(eq(schema.files.id, file.id))

        await Promise.all(
          bunnyStreams.map((bunnyStream) =>
            db.update(schema.bunnyStreams).set({ fileFk: newId }).where(eq(schema.bunnyStreams.id, bunnyStream.id)),
          ),
        )

        await Promise.all(
          topos.map((topo) => db.update(schema.topos).set({ fileFk: newId }).where(eq(schema.topos.id, topo.id))),
        )

        await db
          .update(schema.activities)
          .set({ entityId: newId })
          .where(and(eq(schema.activities.entityId, file.id), eq(schema.activities.entityType, 'file')))
      }),
  )
}
