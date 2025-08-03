import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { ascents, blocks, routes, topoRoutes, topos, type InsertTopoRoute } from '$lib/db/schema'
import { enrichTopo } from '$lib/db/utils'
import { convertException } from '$lib/errors'
import { convertAreaSlug, deleteFiles } from '$lib/helper.server'
import { deleteRoute } from '$lib/routes.server'
import { convertPointsToPath, type TopoDTO, type TopoRouteDTO } from '$lib/topo'
import { error, fail, redirect } from '@sveltejs/kit'
import { and, eq, inArray } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, params }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    if (locals.user == null) {
      error(404)
    }

    const { areaId, areaSlug } = convertAreaSlug(params)

    const blocksResult = await db.query.blocks.findMany({
      where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
      with: {
        routes: {
          orderBy: routes.gradeFk,
          with: {
            ascents: { where: eq(ascents.createdBy, locals.user.id) },
          },
        },
        topos: {
          orderBy: topos.id,
          with: {
            file: true,
            routes: true,
          },
        },
      },
    })
    const block = blocksResult.at(0)

    if (block?.topos == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)) {
      error(404)
    }

    if (blocksResult.length > 1) {
      error(400, `Multiple blocks with slug ${params.blockSlug} in ${areaSlug} found`)
    }

    const enrichedTopos = await Promise.all(
      block.topos.map(async (topo) => {
        const enrichedTopo = await enrichTopo(topo)
        const routes = block.routes.map((route): TopoRouteDTO => {
          const topoRoute = enrichedTopo.routes.find((topoRoute) => topoRoute.routeFk === route.id)

          if (topoRoute == null) {
            return {
              id: undefined,
              points: [],
              regionFk: topo.regionFk,
              route: null,
              routeFk: route.id,
              topoFk: topo.id,
              topType: 'topout',
            }
          }

          return topoRoute
        })

        return { ...enrichedTopo, routes }
      }),
    )

    const enrichedRoutes = block.routes.map((route) => {
      return {
        ...route,
        hasTopo: enrichedTopos.flatMap((topo) => topo.routes).some((topoRoute) => topoRoute.routeFk === route.id),
      }
    })

    return {
      block: { ...block, routes: enrichedRoutes },
      topos: enrichedTopos,
    }
  })
}) satisfies PageServerLoad

export const actions = {
  saveTopos: async ({ locals, params, request }) => {
    const { areaId } = convertAreaSlug(params)

    const rls = await createDrizzleSupabaseClient(locals.supabase)

    return await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      const block = await db.query.blocks.findFirst({
        where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
      })

      if (block == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)) {
        return fail(404)
      }

      const data = await request.formData()
      const parsedTopos = JSON.parse(data.get('topos') as string) as TopoDTO[]

      if (parsedTopos.length === 0 || parsedTopos[0].blockFk == null) {
        return fail(400)
      }

      // Verify that all topos exist before proceeding with any deletions
      const topoIds = parsedTopos.map((topo) => topo.id).filter((id) => id != null)
      const existingTopos = await db.query.topos.findMany({ where: inArray(topos.id, topoIds) })

      if (existingTopos.length !== topoIds.length) {
        return fail(400, { error: 'One or more topos do not exist' })
      }

      await db.delete(topoRoutes).where(inArray(topoRoutes.topoFk, topoIds))

      const toposToUpdate = parsedTopos.flatMap((topo) =>
        topo.routes.filter((topoRoute) => topoRoute.points.length > 0),
      )

      if (toposToUpdate.length > 0) {
        await db.insert(topoRoutes).values(
          toposToUpdate.map(
            (topoRoute): InsertTopoRoute => ({
              id: topoRoute.id,
              path: convertPointsToPath(topoRoute.points),
              regionFk: topoRoute.regionFk,
              routeFk: topoRoute.routeFk,
              topoFk: topoRoute.topoFk,
              topType: topoRoute.topType,
            }),
          ),
        )
      }

      await insertActivity(db, {
        type: 'updated',
        userFk: locals.user.id,
        entityId: String(parsedTopos[0].blockFk),
        entityType: 'block',
        columnName: 'topo',
        parentEntityId: String(areaId),
        parentEntityType: 'area',
        regionFk: parsedTopos[0].regionFk,
      })
    })
  },

  removeTopo: async ({ locals, params, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      const { areaId } = convertAreaSlug(params)

      const data = await request.formData()
      const id = Number(data.get('id'))

      const topo = await db.query.topos.findFirst({ where: eq(topos.id, id), with: { file: true } })

      if (topo == null || topo.blockFk == null) {
        return fail(404, { error: `Topo with id ${id} not found` })
      }

      if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], topo.regionFk)) {
        return fail(404)
      }

      try {
        await db.delete(topoRoutes).where(eq(topoRoutes.topoFk, id))
        await db.delete(topos).where(eq(topos.id, id))

        await deleteFiles({ fileId: topo.fileFk }, db)

        await insertActivity(db, {
          type: 'deleted',
          userFk: locals.user.id,
          entityId: String(topo.blockFk),
          entityType: 'block',
          columnName: 'topo image',
          parentEntityId: String(areaId),
          parentEntityType: 'area',
          regionFk: topo.regionFk,
        })
      } catch (exception) {
        return fail(400, { error: convertException(exception) })
      }

      if (topo.blockFk != null) {
        const remainingTopos = await db.query.topos.findMany({ where: eq(topos.blockFk, topo.blockFk!) })
        if (remainingTopos.length === 0) {
          return `/areas/${params.slugs}/_/blocks/${params.blockSlug}`
        }
      }
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },

  removeRoute: async ({ locals, params, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      const { areaId } = convertAreaSlug(params)

      const data = await request.formData()
      const routeId = Number(data.get('routeId'))

      try {
        return deleteRoute(
          {
            areaId,
            blockSlug: params.blockSlug,
            routeId,
            userId: locals.user.id,
            userRegions: locals.userRegions,
          },
          db,
        )
      } catch (error) {
        return fail(400, { error: convertException(error) })
      }
    })

    return returnValue
  },
}
