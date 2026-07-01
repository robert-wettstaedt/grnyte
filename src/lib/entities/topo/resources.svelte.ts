import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toTopoViews } from './mapper'

/**
 * The block's topo images with their drawn route lines. Reuses `queries.block`
 * (Zero dedupes it with the block detail page's own instance) and maps the raw
 * row to `TopoView[]`.
 */
export function blockTopoList(id: () => number) {
  return createResource(
    () => queries.block({ blockId: id() }),
    (row) => (row == null ? [] : toTopoViews(row)),
  )
}
