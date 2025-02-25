import { load as loadClientLayout } from '$lib/layout/layout'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load = (async (event) => {
  const layoutData = await loadClientLayout(event)

  if (event.data.user == null) {
    error(404)
  }

  return { ...layoutData, ...event.data, user: event.data.user }
}) satisfies PageLoad
