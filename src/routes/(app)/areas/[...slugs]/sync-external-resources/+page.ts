import { page } from '$app/state'
import { queries } from '$lib/db/zero'
import { convertAreaSlugRaw } from '$lib/helper'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load = (async ({ params }) => {
  const { areaId } = convertAreaSlugRaw(params)

  if (areaId == null) {
    error(404)
  }

  const query = queries.listRoutesWithExternalResources(page.data, { areaId })

  return { query }
}) satisfies PageLoad
