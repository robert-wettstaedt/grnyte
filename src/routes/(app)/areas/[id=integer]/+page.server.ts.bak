import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import type { NestedArea } from '$lib/db/types'
import { buildNestedAreaQuery } from '$lib/db/utils'
import { error, redirect } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'

export const load = async ({ locals, params }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const area = await db.query.areas.findFirst({
      where: eq(schema.areas.id, Number(params.id)),
      with: {
        parent: buildNestedAreaQuery(),
      },
    })

    const path = []
    let parent = area
    while (parent != null) {
      path.unshift(`${parent.slug}-${parent.id}`)
      parent = (parent.parent as NestedArea) ?? undefined
    }

    if (area == null || path.length === 0) {
      error(404, 'Not found')
    }

    const mergedPath = ['areas', ...path].join('/')

    redirect(301, '/' + mergedPath)
  })
}
