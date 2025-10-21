import { convertAreaSlugRaw } from '$lib/helper'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load = (async ({ params, parent }) => {
  const { areaId } = convertAreaSlugRaw(params)
  const { z } = await parent()

  if (areaId == null || params.blockSlug == null) {
    error(404)
  }

  const faQuery = z.query.firstAscensionists.orderBy('name', 'asc').related('user')

  return { faQuery }
}) satisfies PageLoad
