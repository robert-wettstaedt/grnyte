import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'
import type { InferResultType } from '../types'

export const migrate = async (db: PostgresJsDatabase<typeof schema>) => {
  const rootAreas = await db.query.areas.findMany({
    where: isNull(schema.areas.parentFk),
    with: {
      areas: {
        with: {
          areas: {
            with: {
              areas: {
                with: {
                  areas: true,
                },
              },
            },
          },
        },
      },
    },
  })

  const users = await db.query.users.findMany()
  const userRoles = await db.query.userRoles.findMany()
  const regionMembers = await db.query.regionMembers.findMany()

  const results = await Promise.all(
    schema.areaVisibilityEnum.map(async (visibility) => {
      let region = await db.query.regions.findFirst({
        where: eq(schema.regions.name, visibility),
      })

      if (region == null) {
        const result = await db.insert(schema.regions).values({ name: visibility }).returning()
        region = result[0]
      }

      const areas = rootAreas.filter((area) => area.visibility === visibility)
      const allAreas = recursiveArea(areas as InferResultType<'areas', { areas: true }>[])
      const areaIds = Array.from(new Set(allAreas.map((area) => area.id)))

      if (areaIds.length > 0) {
        await db.update(schema.areas).set({ regionFk: region.id }).where(inArray(schema.areas.id, areaIds))
      }

      const blocks =
        areaIds.length === 0
          ? []
          : await db
              .update(schema.blocks)
              .set({ regionFk: region.id })
              .where(inArray(schema.blocks.areaFk, areaIds))
              .returning()
      const blockIds = Array.from(new Set(blocks.map((block) => block.id)))

      const routes =
        blockIds.length === 0
          ? []
          : await db
              .update(schema.routes)
              .set({ regionFk: region.id })
              .where(inArray(schema.routes.blockFk, blockIds))
              .returning()
      const routeIds = Array.from(new Set(routes.map((route) => route.id)))

      const routesToFirstAscensionists =
        routeIds.length === 0
          ? []
          : await db.query.routesToFirstAscensionists.findMany({
              where: inArray(schema.routesToFirstAscensionists.routeFk, routeIds),
            })
      const firstAscensionistIds = Array.from(
        new Set(routesToFirstAscensionists.map((item) => item.firstAscensionistFk)),
      )

      if (firstAscensionistIds.length > 0) {
        await db
          .update(schema.firstAscensionists)
          .set({ regionFk: region.id })
          .where(inArray(schema.firstAscensionists.userFk, firstAscensionistIds))
      }

      const ascents =
        routeIds.length === 0
          ? []
          : await db
              .update(schema.ascents)
              .set({ regionFk: region.id })
              .where(inArray(schema.ascents.routeFk, routeIds))
              .returning()
      const ascentIds = Array.from(new Set(ascents.map((ascent) => ascent.id)))

      const filesQuery = [
        ascentIds.length === 0 ? null : inArray(schema.files.ascentFk, ascentIds),
        areaIds.length === 0 ? null : inArray(schema.files.areaFk, areaIds),
        blockIds.length === 0 ? null : inArray(schema.files.blockFk, blockIds),
        routeIds.length === 0 ? null : inArray(schema.files.routeFk, routeIds),
      ].filter((query) => query != null)

      const files =
        filesQuery.length === 0
          ? []
          : await db
              .update(schema.files)
              .set({ regionFk: region.id })
              .where(or(...filesQuery))
              .returning()
      const fileIds = Array.from(new Set(files.map((file) => file.id)))

      if (fileIds.length > 0) {
        await db
          .update(schema.bunnyStreams)
          .set({ regionFk: region.id })
          .where(inArray(schema.bunnyStreams.fileFk, fileIds))
          .returning()
      }

      const topos =
        blockIds.length === 0
          ? []
          : await db
              .update(schema.topos)
              .set({ regionFk: region.id })
              .where(inArray(schema.topos.blockFk, blockIds))
              .returning()
      const topoIds = Array.from(new Set(topos.map((topo) => topo.id)))

      if (topoIds.length > 0) {
        await db
          .update(schema.topoRoutes)
          .set({ regionFk: region.id })
          .where(inArray(schema.topoRoutes.topoFk, topoIds))
          .returning()
      }

      if (routeIds.length > 0) {
        await db
          .update(schema.routesToTags)
          .set({ regionFk: region.id })
          .where(inArray(schema.routesToTags.routeFk, routeIds))
      }

      const geolocationQuery = [
        areaIds.length === 0 ? null : inArray(schema.geolocations.areaFk, areaIds),
        blockIds.length === 0 ? null : inArray(schema.geolocations.blockFk, blockIds),
      ].filter((query) => query != null)

      if (geolocationQuery.length > 0) {
        await db
          .update(schema.geolocations)
          .set({ regionFk: region.id })
          .where(or(...geolocationQuery))
      }

      const activityQuery = [
        areaIds.length === 0
          ? null
          : and(eq(schema.activities.entityType, 'area'), inArray(schema.activities.entityId, areaIds.map(String))),
        ascentIds.length === 0
          ? null
          : and(eq(schema.activities.entityType, 'ascent'), inArray(schema.activities.entityId, ascentIds.map(String))),
        blockIds.length === 0
          ? null
          : and(eq(schema.activities.entityType, 'block'), inArray(schema.activities.entityId, blockIds.map(String))),
        fileIds.length === 0
          ? null
          : and(eq(schema.activities.entityType, 'file'), inArray(schema.activities.entityId, fileIds.map(String))),
        routeIds.length === 0
          ? null
          : and(eq(schema.activities.entityType, 'route'), inArray(schema.activities.entityId, routeIds.map(String))),
        areaIds.length === 0
          ? null
          : and(
              eq(schema.activities.parentEntityType, 'area'),
              inArray(schema.activities.parentEntityId, areaIds.map(String)),
            ),
        ascentIds.length === 0
          ? null
          : and(
              eq(schema.activities.parentEntityType, 'ascent'),
              inArray(schema.activities.parentEntityId, ascentIds.map(String)),
            ),
        blockIds.length === 0
          ? null
          : and(
              eq(schema.activities.parentEntityType, 'block'),
              inArray(schema.activities.parentEntityId, blockIds.map(String)),
            ),
        routeIds.length === 0
          ? null
          : and(
              eq(schema.activities.parentEntityType, 'route'),
              inArray(schema.activities.parentEntityId, routeIds.map(String)),
            ),
      ].filter((query) => query != null)

      if (activityQuery.length > 0) {
        await db
          .update(schema.activities)
          .set({ regionFk: region.id })
          .where(or(...activityQuery))
      }

      return { region, visibility }
    }),
  )

  const publicResult = results.find((result) => result.visibility === 'public')

  if (publicResult != null) {
    const newRegionMembers = userRoles
      .filter((userRole) => !regionMembers.some((member) => member.authUserFk === userRole.authUserFk))
      .map((userRole) => {
        const user = users.find((user) => user.authUserFk === userRole.authUserFk)

        if (user == null) {
          return null
        }

        return {
          authUserFk: userRole.authUserFk,
          userFk: user.id,
          role: userRole.role,
          regionFk: publicResult.region.id,
          isActive: true,
        }
      })
      .filter((member) => member != null)

    if (newRegionMembers.length > 0) {
      await db.insert(schema.regionMembers).values(newRegionMembers)
    }
  }
}

function recursiveArea(areas: InferResultType<'areas', { areas: true }>[]) {
  let childAreas = [...areas]

  for (const area of areas) {
    if (area.areas.length > 0) {
      const result = recursiveArea(area.areas as InferResultType<'areas', { areas: true }>[])
      childAreas.push(...result)
    }
  }

  return childAreas
}
