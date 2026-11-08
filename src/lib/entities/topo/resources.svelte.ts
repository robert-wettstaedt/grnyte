import { blockTree, blockTreesByIds } from '$lib/entities/block/resources.svelte'
import { toTopoViews } from './mapper'

/** The block's topo images with their drawn route lines, off the block page's own live query. */
export function blockTopoList(id: () => number) {
  return blockTree(id, (row) => (row == null ? [] : toTopoViews(row)))
}

/**
 * Every topo of several blocks at once, keyed by its own id: what the feed needs to draw the
 * photo a change row points at, for a window of rows that may span many blocks.
 */
export function toposByBlockIds(blockIds: () => number[]) {
  // Rebuilt wholesale on every result (the new reference is the reactivity), so a SvelteMap would buy nothing.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  return blockTreesByIds(blockIds, (rows) => new Map(rows.flatMap(toTopoViews).map((view) => [view.id, view])))
}
