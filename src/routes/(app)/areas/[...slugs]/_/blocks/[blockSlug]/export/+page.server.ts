import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { blocks } from '$lib/db/schema'
import { enrichBlock, enrichTopo } from '$lib/db/utils'
import { convertAreaSlug } from '$lib/helper.server'
import { load as loadServerLayout } from '$lib/layout/layout.server'
import { convertMarkdownToHtml } from '$lib/markdown'
import { error } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async (event) => {
  const { locals, params } = event

  const layoutData = await loadServerLayout(event)

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const { areaId, areaSlug } = convertAreaSlug(params)

    // Query the database for blocks matching the given slug and areaId
    const blocksResult = await db.query.blocks.findMany({
      where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
      with: {
        area: {
          with: {
            parent: true,
          },
        },
        geolocation: true,
        routes: {
          with: {
            firstAscents: {
              with: {
                firstAscensionist: true,
              },
            },
            tags: true,
          },
        },
        topos: {
          with: {
            routes: true,
            storageObject: {
              with: {
                storageObject: true,
              },
            },
          },
        },
      },
    })

    // Get the first block from the result
    const block = blocksResult.at(0)

    // If no block is found, throw a 404 error
    if (block == null) {
      error(404)
    }

    // If more than one block is found, throw a 400 error
    if (blocksResult.length > 1) {
      error(400, `Multiple blocks with slug ${params.blockSlug} in ${areaSlug} found`)
    }

    const toposResult = await Promise.all(block.topos.map((topo) => enrichTopo(topo, locals.supabase)))
    const enrichedBlock = enrichBlock(block)

    const enrichedRoutes = await Promise.all(
      block.routes.map(async (route) => ({
        ...route,
        description: route.description == null ? null : await convertMarkdownToHtml(route.description, db, 'strong'),
      })),
    )

    return {
      ...layoutData,
      block: {
        ...block,
        ...enrichedBlock,
        routes: enrichedRoutes,
        topos: toposResult,
      },
    }
  })
}) satisfies PageServerLoad
