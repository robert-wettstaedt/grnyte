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

/**
 * Every topo of several blocks at once, keyed by its own id: what the feed needs to draw the
 * photo an activity row points at, for a window of rows that may span many blocks.
 */
export function toposByBlockIds(blockIds: () => number[]) {
  return createResource(
    () => queries.blockTopos({ blockId: blockIds() }),
    // Rebuilt wholesale on every query result (the new reference is the reactivity) and
    // never mutated afterwards, so a SvelteMap would buy nothing.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    (rows) => new Map(rows.flatMap(toTopoViews).map((view) => [view.id, view])),
  )
}
