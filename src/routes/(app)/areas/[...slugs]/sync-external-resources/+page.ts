import { convertAreaSlugRaw } from '$lib/helper'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load = (async ({ parent, params }) => {
  const { areaId } = convertAreaSlugRaw(params)
  const { z } = await parent()

  if (areaId == null) {
    error(404)
  }

  const query = z.query.routes
    .where('areaIds', 'ILIKE', `%^${areaId}$%`)
    .related('block')
    .related('externalResources', (q) =>
      q.related('externalResource27crags').related('externalResource8a').related('externalResourceTheCrag'),
    )

  return { query }
}) satisfies PageLoad
