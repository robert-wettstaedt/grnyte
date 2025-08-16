import { convertAreaSlugRaw } from '$lib/helper'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load = (async ({ parent, params }) => {
  const { areaId } = convertAreaSlugRaw(params)
  const { z } = await parent()

  if (areaId == null || params.blockSlug == null) {
    error(404)
  }

  const query = z.current.query.blocks.where('slug', params.blockSlug).where('areaFk', areaId)

  return { query }
}) satisfies PageLoad
