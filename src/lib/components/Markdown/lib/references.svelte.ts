import { queries } from '$lib/zero/queries'
import { createResource, type QueryResource } from '$lib/zero/resource.svelte'
import type { MarkdownReference, MarkdownReferencesIds, ReferenceType } from './remark-references'

/**
 * Resolves the area/block/route/user ids referenced in a markdown string to
 * `{ type, id, name }` tuples, read reactively from Zero. Each kind is gated so
 * no query runs for a reference type that isn't present. Wraps `createResource`
 * the same way the entity resource factories do, but spans all four tables.
 *
 * Once a kind's query is complete, any requested id missing from the result is a
 * deleted reference — surfaced as a `missing` tombstone so it renders "… not found"
 * instead of a dead link. Gated on `isComplete` so still-loading refs don't flash.
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

  // Users resolve by their (region-agnostic) ids already embedded in the
  // content — `usersByIds` is the by-id resolver, not the picker enumerator.
  const users = createResource(
    () => queries.usersByIds({ id: ids().users }),
    (rows) => rows.map((row): MarkdownReference => ({ type: 'users', id: row.id, name: row.username })),
    { enabled: () => ids().users.length > 0 },
  )

  // Requested ids absent from a completed result are deleted targets → tombstones.
  const tombstones = (
    type: ReferenceType,
    requested: number[],
    resource: QueryResource<MarkdownReference[]>,
  ): MarkdownReference[] => {
    if (!resource.isComplete) return []
    return requested
      .filter((id) => !resource.data.some((ref) => ref.id === id))
      .map((id) => ({ type, id, name: '', missing: true }))
  }

  return {
    get data(): MarkdownReference[] {
      return [
        ...areas.data,
        ...blocks.data,
        ...routes.data,
        ...users.data,
        ...tombstones('areas', ids().areas, areas),
        ...tombstones('blocks', ids().blocks, blocks),
        ...tombstones('routes', ids().routes, routes),
        ...tombstones('users', ids().users, users),
      ]
    },
  }
}
