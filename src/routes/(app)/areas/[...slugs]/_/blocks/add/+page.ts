import { convertAreaSlugRaw } from '$lib/helper'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load = (async ({ parent, params }) => {
  const { areaId } = convertAreaSlugRaw(params)
  const { z } = await parent()

  if (areaId == null) {
    error(404)
  }

  const query = z.current.query.blocks.where('areaFk', areaId).related('area')

  return { query }
}) satisfies PageLoad
