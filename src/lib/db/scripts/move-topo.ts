import { and, eq, inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'

export const moveTopo = async (db: PostgresJsDatabase<typeof schema>, fromBlockId: number, toBlockId: number) => {
  await db.transaction(async (db) => {
    const fromBlock = await db.query.blocks.findFirst({
      where: eq(schema.blocks.id, fromBlockId),
      with: {
        routes: true,
        topos: {
          with: {
            routes: true,
          },
        },
      },
    })

    const toBlock = await db.query.blocks.findFirst({
      where: eq(schema.blocks.id, toBlockId),
      with: {
        routes: true,
      },
    })

    if (fromBlock == null) {
      throw new Error('from Block not found')
    }

    if (toBlock == null) {
      throw new Error('to Block not found')
    }

    if (fromBlock.geolocationFk != null) {
      await db
        .update(schema.geolocations)
        .set({ blockFk: toBlock.id, regionFk: toBlock.regionFk })
        .where(eq(schema.geolocations.blockFk, fromBlock.id))

      await db
        .update(schema.blocks)
        .set({ geolocationFk: fromBlock.geolocationFk })
        .where(eq(schema.blocks.id, toBlock.id))
      await db.update(schema.blocks).set({ geolocationFk: null }).where(eq(schema.blocks.id, fromBlock.id))
    }

    await db
      .update(schema.files)
      .set({ blockFk: toBlock.id, regionFk: toBlock.regionFk })
      .where(eq(schema.files.blockFk, fromBlock.id))

    await db
      .update(schema.topos)
      .set({ blockFk: toBlock.id, regionFk: toBlock.regionFk })
      .where(
        inArray(
          schema.topos.id,
          fromBlock.topos.map((topo) => topo.id),
        ),
      )

    await db
      .update(schema.activities)
      .set({ entityId: String(toBlock.id), regionFk: toBlock.regionFk })
      .where(and(eq(schema.activities.entityId, String(fromBlock.id)), eq(schema.activities.entityType, 'block')))

    await db
      .update(schema.activities)
      .set({ parentEntityId: String(toBlock.id), regionFk: toBlock.regionFk })
      .where(
        and(
          eq(schema.activities.parentEntityId, String(fromBlock.id)),
          eq(schema.activities.parentEntityType, 'block'),
        ),
      )

    await Promise.all(
      fromBlock.routes.map(async (fromRoute) => {
        const toRoute = toBlock.routes.find((r) => r.name === fromRoute.name)

        if (fromRoute.name.length > 1 && toRoute != null) {
          // Route stays in old block

          await db
            .update(schema.topoRoutes)
            .set({ regionFk: toBlock.regionFk, routeFk: toRoute.id })
            .where(eq(schema.topoRoutes.routeFk, fromRoute.id))

          await db
            .update(schema.activities)
            .set({ entityId: String(toRoute.id), regionFk: toRoute.regionFk })
            .where(and(eq(schema.activities.entityId, String(fromRoute.id)), eq(schema.activities.entityType, 'route')))

          await db
            .update(schema.activities)
            .set({ parentEntityId: String(toRoute.id), regionFk: toRoute.regionFk })
            .where(
              and(
                eq(schema.activities.parentEntityId, String(fromRoute.id)),
                eq(schema.activities.parentEntityType, 'route'),
              ),
            )
        } else {
          // Route is moved to new block

          await db
            .update(schema.routes)
            .set({ blockFk: toBlock.id, regionFk: toBlock.regionFk })
            .where(eq(schema.routes.id, fromRoute.id))

          await db
            .update(schema.topoRoutes)
            .set({ regionFk: toBlock.regionFk })
            .where(eq(schema.topoRoutes.routeFk, fromRoute.id))

          await db
            .update(schema.activities)
            .set({ regionFk: toBlock.regionFk })
            .where(and(eq(schema.activities.entityId, String(fromRoute.id)), eq(schema.activities.entityType, 'route')))

          await db
            .update(schema.activities)
            .set({ regionFk: toBlock.regionFk })
            .where(
              and(
                eq(schema.activities.parentEntityId, String(fromRoute.id)),
                eq(schema.activities.parentEntityType, 'route'),
              ),
            )
        }
      }),
    )
  })
}
