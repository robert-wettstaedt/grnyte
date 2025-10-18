import { convertAreaSlugRaw, getRouteDbFilterRaw } from '$lib/helper'
import { error } from '@sveltejs/kit'
import type { LayoutLoad } from './$types'

export const load = (async ({ parent, params }) => {
  const { areaId } = convertAreaSlugRaw(params)
  const { z } = await parent()

  if (areaId == null || params.blockSlug == null) {
    error(404)
  }

  const routeQuery = z.query.blocks
    .where('slug', params.blockSlug)
    .where('areaFk', areaId)
    .whereExists('routes', (q) => getRouteDbFilterRaw(params, q))
    .related('routes', (q) => getRouteDbFilterRaw(params, q).related('tags'))
    .related('topos')
    .one()

  return { routeQuery }
}) satisfies LayoutLoad
