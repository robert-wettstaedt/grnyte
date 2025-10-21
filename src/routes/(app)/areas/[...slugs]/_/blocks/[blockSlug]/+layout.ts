import { convertAreaSlugRaw } from '$lib/helper'
import { error } from '@sveltejs/kit'
import type { LayoutLoad } from './$types'

export const load = (async ({ parent, params }) => {
  const { areaId } = convertAreaSlugRaw(params)
  const { z } = await parent()

  if (areaId == null || params.blockSlug == null) {
    error(404)
  }

  const blockQuery = z.query.blocks
    .where('areaFk', areaId)
    .where('slug', params.blockSlug)
    .related('topos', (q) => q.related('file'))
    .related('geolocation')
    .one()

  return { blockQuery }
}) satisfies LayoutLoad
