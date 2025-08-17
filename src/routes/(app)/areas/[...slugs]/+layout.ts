import { convertAreaSlugRaw } from '$lib/helper'
import { error } from '@sveltejs/kit'
import type { LayoutLoad } from './$types'

export const load = (async ({ parent, params }) => {
  const { areaId } = convertAreaSlugRaw(params)
  const { z } = await parent()

  if (areaId == null) {
    error(404)
  }

  const areaQuery = z.current.query.areas
    .where('id', areaId)
    .related('author')
    .related('parent')
    .related('files')
    .related('parkingLocations')
    .one()

  return { areaQuery }
}) satisfies LayoutLoad
