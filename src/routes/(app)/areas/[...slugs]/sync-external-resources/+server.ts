import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import type { InferResultType } from '$lib/db/types'
import { insertExternalResources, queryExternalResource } from '$lib/external-resources/index.server'
import { convertAreaSlug } from '$lib/helper.server'
import { error } from '@sveltejs/kit'

export async function POST({ locals, params, request }) {
  if (locals.user == null) {
    // If the user is not authenticated, throw a 401 error
    error(401)
  }

  const { areaId } = convertAreaSlug(params)

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const routes = await db.query.routes.findMany({
      where: (table, { ilike }) => ilike(table.areaIds, `%^${areaId}$%`),
      with: {
        block: true,
      },
    })

    const stream = new ReadableStream({
      async start(controller) {
        for await (const route of routes) {
          if (request.signal.aborted) {
            controller.close()
            return
          }

          const data = await queryExternalResource(route.name, route.block.id, locals)

          const dto: InferResultType<
            'routeExternalResources',
            { externalResource8a: true; externalResource27crags: true; externalResourceTheCrag: true }
          > = {
            id: -1,
            regionFk: route.regionFk,
            routeFk: route.id,
            externalResource8a: data.data8a,
            externalResource8aFk: null,
            externalResource27crags: data.data27crags,
            externalResource27cragsFk: null,
            externalResourceTheCrag: data.dataTheCrag,
            externalResourceTheCragFk: null,
          }

          await insertExternalResources(route, route.block, locals)

          controller.enqueue(JSON.stringify(dto) + '\n')
        }

        controller.close()
      },
    })

    return new Response(stream)
  })
}
