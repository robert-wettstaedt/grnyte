import { page } from '$app/state'
import { queries } from '$lib/db/zero'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load = (async ({ params }) => {
  if (params.ascentId == null) {
    error(404)
  }

  const query = queries.ascent(page.data, { id: Number(params.ascentId) })

  return { query }
}) satisfies PageLoad
