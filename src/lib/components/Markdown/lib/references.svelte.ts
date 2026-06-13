import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import type { MarkdownReference, MarkdownReferencesIds } from './remark-references'

/**
 * Resolves the area/block/route ids referenced in a markdown string to
 * `{ type, id, name }` tuples, read reactively from Zero. Each kind is gated so
 * no query runs for a reference type that isn't present. Wraps `createResource`
 * the same way the entity resource factories do, but spans all three tables.
 */
export function markdownReferences(ids: () => MarkdownReferencesIds) {
  const areas = createResource(
    () => queries.listAreas({ id: ids().areas }),
    (rows) => rows.map((row): MarkdownReference => ({ type: 'areas', id: row.id, name: row.name })),
    { enabled: () => ids().areas.length > 0 },
  )

  const blocks = createResource(
    () => queries.listBlocks({ blockId: ids().blocks }),
    (rows) => rows.map((row): MarkdownReference => ({ type: 'blocks', id: row.id, name: row.name })),
    { enabled: () => ids().blocks.length > 0 },
  )

  const routes = createResource(
    () => queries.listRoutes({ routeId: ids().routes }),
    (rows) => rows.map((row): MarkdownReference => ({ type: 'routes', id: row.id, name: row.name })),
    { enabled: () => ids().routes.length > 0 },
  )

  return {
    get data(): MarkdownReference[] {
      return [...areas.data, ...blocks.data, ...routes.data]
    },
  }
}
