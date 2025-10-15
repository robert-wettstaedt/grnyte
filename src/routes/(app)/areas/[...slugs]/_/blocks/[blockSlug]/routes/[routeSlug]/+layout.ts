import { page } from '$app/state'
import { queries } from '$lib/db/zero'
import { convertAreaSlugRaw } from '$lib/helper'
import { error } from '@sveltejs/kit'
import type { LayoutLoad } from './$types'

export const load = (async ({ params }) => {
  const { areaId } = convertAreaSlugRaw(params)

  if (areaId == null || params.blockSlug == null) {
    error(404)
  }

  const routeQuery = queries.route(page.data.session, {
    areaId,
    blockSlug: params.blockSlug,
    routeSlug: params.routeSlug,
  })

  return { routeQuery }
}) satisfies LayoutLoad
