import { convertAreaSlugRaw } from '$lib/helper'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load = (async ({ parent, params }) => {
  const { areaId } = convertAreaSlugRaw(params)
  const { z } = await parent()

  if (areaId == null || params.blockSlug == null) {
    return error(404)
  }

  const query = z.current.query.blocks.where('areaFk', areaId).where('slug', params.blockSlug).related('topos').one()

  return { query }
}) satisfies PageLoad
