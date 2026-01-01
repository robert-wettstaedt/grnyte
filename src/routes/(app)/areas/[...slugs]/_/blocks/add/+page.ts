import { queries } from '$lib/db/zero'
import { convertAreaSlugRaw } from '$lib/helper'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load = (async ({ params }) => {
  const { areaId } = convertAreaSlugRaw(params)

  if (areaId == null) {
    error(404)
  }

  const query = queries.listBlocks({ areaId })

  return { query }
}) satisfies PageLoad
