import { getStatsOfArea, nestedAreaQuery } from '$lib/blocks.server'
import { load as routesFilterLoad } from '$lib/components/RoutesFilter/handle.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { areas, ascents, blocks, routes } from '$lib/db/schema'
import { enrichTopo, sortRoutesByTopo } from '$lib/db/utils'
import { convertMarkdownToHtml } from '$lib/markdown'
import { loadFiles } from '$lib/nextcloud/nextcloud.server'
import { getReferences } from '$lib/references.server'
import { error, redirect } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async (event) => {
  const { locals, parent } = event

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Retrieve the areaId from the parent context
    const { areaSlug, areaId, grades, path, user } = await parent()

    const filteredRoutes = await routesFilterLoad(event, areaId)

    // Query the database for areas with the specified areaId
    const areasResult = await db.query.areas.findMany({
      where: eq(areas.id, areaId),
      with: {
        author: true, // Include author information
        blocks: {
          orderBy: [blocks.order, blocks.name], // Order blocks by name and order
          with: {
            routes: {
              orderBy: routes.gradeFk,
              with: {
                ascents: user == null ? { limit: 0 } : { where: eq(ascents.createdBy, user.id) },
              },
            },
            topos: {
              with: {
                routes: true,
                file: true,
              },
            },
          },
        },
        areas: {
          ...nestedAreaQuery,
          orderBy: areas.name, // Order nested areas by name
        },
        files: true, // Include files associated with the area
        parkingLocations: true,
      },
    })

    // Get the last area from the result
    const area = areasResult.at(-1)

    // If no area is found, throw a 404 error
    if (area == null) {
      error(404)
    }

    if (area.slug !== areaSlug) {
      const newPath = path.map((segment) => segment.replace(`${areaSlug}-${areaId}`, `${area.slug}-${area.id}`))
      redirect(302, `/areas/${newPath.join('/')}`)
    }

    // Process area description from markdown to HTML if description is present
    const description = area.description == null ? null : await convertMarkdownToHtml(area.description, db)

    const blocksWithTopos = await Promise.all(
      area.blocks.map(async (block) => {
        const topos = await Promise.all(block.topos.map((topo) => enrichTopo(topo, false)))

        const sortedRoutes = sortRoutesByTopo(block.routes, topos).map((route) => {
          const topo = topos.find((topo) => topo.routes.some((topoRoute) => topoRoute.routeFk === route.id))
          return { ...route, topo }
        })

        return { ...block, routes: sortedRoutes, topos }
      }),
    )

    const files = await loadFiles(area.files)

    // Return the area, enriched blocks, and processed files
    return {
      area: {
        ...getStatsOfArea(area, grades, user),
        areas: area.areas.map((area) => getStatsOfArea(area, grades, user)),
        blocks: blocksWithTopos,
        description,
        files,
      },
      references: getReferences(area.id, 'areas'),
      routes: filteredRoutes,
    }
  })
}) satisfies PageServerLoad
