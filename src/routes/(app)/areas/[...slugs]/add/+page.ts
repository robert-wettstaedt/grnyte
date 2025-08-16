import { convertAreaSlugRaw } from '$lib/helper'
import type { PageLoad } from './$types'

export const load = (async ({ parent, params }) => {
  const { areaId } = convertAreaSlugRaw(params)
  const { z } = await parent()

  if (areaId == null) {
    return { query: null }
  }

  const query = z.current.query.areas.where('id', areaId).one()

  return { query }
}) satisfies PageLoad
