import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toMediaFile } from './mapper'

/** The media files attached directly to a route. */
export function routeFileList(routeId: () => number) {
  return createResource(
    () => queries.listRouteFiles({ routeId: routeId() }),
    (rows) => rows.map(toMediaFile),
  )
}
