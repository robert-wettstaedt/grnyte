import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import type { NestedArea } from '$lib/db/types'
import { buildNestedAreaQuery } from '$lib/db/utils'
import { error, redirect } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'

export const load = async ({ locals, params }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const route = await db.query.routes.findFirst({
      where: eq(schema.routes.id, Number(params.id)),
      with: {
        block: {
          with: {
            area: buildNestedAreaQuery(),
          },
        },
      },
    })

    const path = []
    let parent = route?.block?.area
    while (parent != null) {
      path.unshift(`${parent.slug}-${parent.id}`)
      parent = (parent as NestedArea).parent ?? undefined
    }

    if (route == null || path.length === 0) {
      error(404, 'Not found')
    }

    const mergedPath = [
      'areas',
      ...path,
      '_',
      'blocks',
      route.block?.slug,
      'routes',
      route.slug.length === 0 ? route.id : route.slug,
    ].join('/')

    redirect(301, '/' + mergedPath)
  })
}
