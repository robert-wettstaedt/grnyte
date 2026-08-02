import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toMediaFile } from './mapper'

/**
 * Files for a set of ids — the activity feed's upload cards, whose rows name the file
 * rather than what it was attached to. An empty id set queries `IN []` and settles
 * ready-and-empty, which is what tells the feed a missing file is gone rather than late.
 */
export function filesByIds(ids: () => string[]) {
  return createResource(
    () => queries.listFilesByIds({ id: ids() }),
    (rows) => rows.map(toMediaFile),
  )
}

/** The media files attached directly to a route. */
export function routeFileList(routeId: () => number) {
  return createResource(
    () => queries.listRouteFiles({ routeId: routeId() }),
    (rows) => rows.map(toMediaFile),
  )
}
