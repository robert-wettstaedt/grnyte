import { convertAreaSlugRaw } from '$lib/helper'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load = (async ({ parent, params }) => {
  const { areaId } = convertAreaSlugRaw(params)
  const { z } = await parent()

  if (params.ascentId == null) {
    error(404)
  }

  const query = z.query.ascents.where('id', Number(params.ascentId)).related('author').related('route').one()

  return { query }
}) satisfies PageLoad
