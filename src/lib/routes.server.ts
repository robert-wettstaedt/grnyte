import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import * as schema from '$lib/db/schema'
import {
  ascents,
  routeExternalResource27crags,
  routeExternalResource8a,
  routeExternalResources,
  routeExternalResourceTheCrag,
  routes,
  routesToFirstAscensionists,
  routesToTags,
  topoRoutes,
} from '$lib/db/schema'
import { deleteFiles } from '$lib/helper.server'
import { getReferences } from '$lib/references.server'
import { error } from '@sveltejs/kit'
import { eq, inArray, isNotNull, or } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

export const updateRoutesUserData = async (routeFk: number, db: PostgresJsDatabase<typeof schema>) => {
  const route = await db.query.routes.findFirst({
    where: eq(schema.routes.id, routeFk),
    with: {
      ascents: {
        where: or(isNotNull(schema.ascents.gradeFk), isNotNull(schema.ascents.rating)),
      },
    },
  })

  if (route == null) {
    return null
  }

  const getMean = (key: 'gradeFk' | 'rating') => {
    const ascents = route.ascents.filter((ascent) => ascent[key] != null)

    let sum = ascents.reduce((sum, ascent) => sum + ascent[key]!, 0)
    let length = ascents.length

    if (route[key] != null) {
      sum += route[key]
      length += 1
    }

    if (length === 0) {
      return null
    }

    return Math.round(sum / length)
  }

  const userGradeFk = getMean('gradeFk')
  const userRating = getMean('rating')

  if (userGradeFk !== route.userGradeFk || userRating !== route.userRating) {
    await db.update(schema.routes).set({ userGradeFk, userRating }).where(eq(schema.routes.id, route.id))
  }
}

interface DeleteRouteParams {
  routeId: number
  userId: number
  userRegions: App.UserRegion[]
}

export const deleteRoute = async (params: DeleteRouteParams, db: PostgresJsDatabase<typeof schema>) => {
  const route = await db.query.routes.findFirst({
    where: (table, { eq }) => eq(table.id, params.routeId),
    with: {
      ascents: true,
      externalResources: true,
      files: true,
      firstAscents: {
        with: {
          firstAscensionist: true,
        },
      },
      tags: true,
    },
  })

  if (route == null) {
    error(404)
  }

  if (!checkRegionPermission(params.userRegions, [REGION_PERMISSION_DELETE], route.regionFk)) {
    error(401)
  }

  const references = await getReferences(route.id, 'routes')
  if (references.areas.length + references.ascents.length + references.routes.length > 0) {
    error(400, 'Route is referenced by other entities. Delete references first.')
  }

  await deleteFiles({ routeFk: route.id }, db)
  await Promise.all(route.ascents.map((ascent) => deleteFiles({ ascentFk: ascent.id }, db)))

  await db.delete(ascents).where(eq(ascents.routeFk, route.id))
  await db.delete(routesToFirstAscensionists).where(eq(routesToFirstAscensionists.routeFk, route.id))
  await db.delete(routesToTags).where(eq(routesToTags.routeFk, route.id))
  await db.delete(topoRoutes).where(eq(topoRoutes.routeFk, route.id))

  const externalResources = await db.query.routeExternalResources.findMany({
    where: eq(routeExternalResources.routeFk, route.id),
  })
  await db
    .update(routeExternalResources)
    .set({
      externalResource8aFk: null,
      externalResource27cragsFk: null,
      externalResourceTheCragFk: null,
    })
    .where(eq(routeExternalResources.routeFk, route.id))

  const ex8aIds = externalResources.map((er) => er.externalResource8aFk).filter((id) => id != null)
  if (ex8aIds.length > 0) {
    await db.delete(routeExternalResource8a).where(inArray(routeExternalResource8a.id, ex8aIds))
  }

  const ex27cragsIds = externalResources.map((er) => er.externalResource27cragsFk).filter((id) => id != null)
  if (ex27cragsIds.length > 0) {
    await db.delete(routeExternalResource27crags).where(inArray(routeExternalResource27crags.id, ex27cragsIds))
  }

  const exTheCragIds = externalResources.map((er) => er.externalResourceTheCragFk).filter((id) => id != null)
  if (exTheCragIds.length > 0) {
    await db.delete(routeExternalResourceTheCrag).where(inArray(routeExternalResourceTheCrag.id, exTheCragIds))
  }

  await db.update(routes).set({ externalResourcesFk: null }).where(eq(routes.id, route.id))
  await db.delete(routeExternalResources).where(eq(routeExternalResources.routeFk, route.id))
  await db.delete(routes).where(eq(routes.id, route.id))

  await insertActivity(db, {
    type: 'deleted',
    userFk: params.userId,
    entityId: String(route.id),
    entityType: 'route',
    oldValue: route.name,
    parentEntityId: String(route.blockFk),
    parentEntityType: 'block',
    regionFk: route.regionFk,
  })

  return route
}
