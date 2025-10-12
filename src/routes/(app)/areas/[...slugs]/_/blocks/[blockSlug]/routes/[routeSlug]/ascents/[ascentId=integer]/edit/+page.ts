import { queries } from '$lib/db/zero'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load = (async ({ params }) => {
  if (params.ascentId == null) {
    error(404)
  }

  const query = queries.ascent({ id: Number(params.ascentId) })

  return { query }
}) satisfies PageLoad
