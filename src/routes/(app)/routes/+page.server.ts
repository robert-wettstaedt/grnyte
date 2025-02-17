import { load as routesFilterLoad } from '$lib/components/RoutesFilter/handle.server'
import type { PageServerLoad } from './$types'

export const load = (async (event) => {
  return routesFilterLoad(event)
}) satisfies PageServerLoad
