import { queries } from '$lib/db/zero'
import { convertAreaSlugRaw } from '$lib/helper'
import { error } from '@sveltejs/kit'
import type { LayoutLoad } from './$types'

export const load = (async ({ params }) => {
  const { areaId } = convertAreaSlugRaw(params)

  if (areaId == null || params.blockSlug == null) {
    error(404)
  }

  const blockQuery = queries.block({ areaId, blockSlug: params.blockSlug })

  return { blockQuery }
}) satisfies LayoutLoad
