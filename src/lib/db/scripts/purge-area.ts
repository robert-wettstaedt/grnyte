import { deleteFiles } from '$lib/helper.server'
import { and, eq, ilike, inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'

export const purgeArea = async (db: PostgresJsDatabase<typeof schema>, areaId: number) => {
  await db.transaction(async (db) => {
    const routes = await db.query.routes.findMany({
      where: ilike(schema.routes.areaIds, `^%${areaId}%$`),
      with: {
        files: true,
        firstAscents: true,
        tags: true,
        block: {
          with: {
            topos: {
              with: {
                routes: true,
              },
            },
          },
        },
      },
    })

    const routeIds = Array.from(new Set(routes.map((r) => r.id)))
    const blockIds = Array.from(new Set(routes.map((r) => r.blockFk)))
    const areaFks = Array.from(
      new Set(
        routes
          .flatMap((r) => {
            const index = r.areaFks?.indexOf(areaId) ?? -1
            return index >= 0 ? r.areaFks?.slice(index) : null
          })
          .filter((d) => d != null),
      ),
    )
    const topoIds = Array.from(new Set(routes.flatMap((r) => r.block.topos.map((t) => t.id))))

    await db
      .delete(schema.routesToFirstAscensionists)
      .where(inArray(schema.routesToFirstAscensionists.routeFk, routeIds))

    await db.delete(schema.routesToTags).where(inArray(schema.routesToTags.routeFk, routeIds))
    await db.update(schema.blocks).set({ geolocationFk: null }).where(inArray(schema.blocks.id, blockIds))
    await db.delete(schema.geolocations).where(inArray(schema.geolocations.blockFk, blockIds))
    await db.delete(schema.geolocations).where(inArray(schema.geolocations.areaFk, areaFks))
    await db.delete(schema.topoRoutes).where(inArray(schema.topoRoutes.routeFk, topoIds))
    await db.delete(schema.topos).where(inArray(schema.topos.blockFk, blockIds))

    await db.delete(schema.routes).where(inArray(schema.routes.id, routeIds))
    await db.delete(schema.blocks).where(inArray(schema.blocks.id, blockIds))
    await db.delete(schema.areas).where(inArray(schema.areas.id, areaFks))

    await db.delete(schema.activities).where(
      and(
        inArray(
          schema.activities.entityId,
          routes.map((r) => String(r.id)),
        ),
        eq(schema.activities.entityType, 'route'),
      ),
    )

    await db.delete(schema.activities).where(
      and(
        inArray(
          schema.activities.entityId,
          routes.map((r) => String(r.blockFk)),
        ),
        eq(schema.activities.entityType, 'block'),
      ),
    )

    await db.delete(schema.activities).where(
      and(
        inArray(
          schema.activities.entityId,
          routes.flatMap((r) => r.areaFks?.map((id) => String(id)) ?? []),
        ),
        eq(schema.activities.entityType, 'area'),
      ),
    )

    await Promise.all(routes.map(async (route) => deleteFiles({ routeFk: route.id }, db)))
    await Promise.all(routes.map(async (route) => deleteFiles({ blockFk: route.blockFk }, db)))

    console.log('done')
  })
}
