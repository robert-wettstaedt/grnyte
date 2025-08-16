import { convertAreaSlugRaw } from '$lib/helper'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load = (async ({ parent, params }) => {
  const { areaSlug, parentSlug } = convertAreaSlugRaw(params)
  const { z } = await parent()

  if (areaSlug == null) {
    error(404)
  }

  let query = z.current.query.areas
    .where('slug', areaSlug)
    .related('author')
    .related('parent')
    .related('files')
    .related('parkingLocations')
    .one()

  if (parentSlug == null) {
    query = query.where('parentFk', 'IS', null)
  } else {
    query = query.whereExists('parent', (q) => q.where('slug', parentSlug))
  }

  return { query }
}) satisfies PageLoad
