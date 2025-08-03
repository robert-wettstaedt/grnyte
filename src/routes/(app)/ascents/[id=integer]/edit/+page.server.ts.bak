import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import type { NestedArea } from '$lib/db/types'
import { buildNestedAreaQuery } from '$lib/db/utils'
import { error, redirect } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'

export const load = async ({ locals, params }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const ascent = await db.query.ascents.findFirst({
      where: eq(schema.ascents.id, Number(params.id)),
      with: {
        route: {
          with: {
            block: {
              with: {
                area: buildNestedAreaQuery(),
              },
            },
          },
        },
      },
    })

    const path = []
    let parent = ascent?.route?.block?.area
    while (parent != null) {
      path.unshift(`${parent.slug}-${parent.id}`)
      parent = (parent as NestedArea).parent ?? undefined
    }

    if (ascent == null || path.length === 0) {
      error(404, 'Not found')
    }

    const mergedPath = [
      'areas',
      ...path,
      '_',
      'blocks',
      ascent.route?.block?.slug,
      'routes',
      ascent.route?.slug.length === 0 ? ascent.route?.id : ascent.route?.slug,
      'ascents',
      ascent.id,
      'edit',
    ].join('/')

    redirect(301, '/' + mergedPath)
  })
}
