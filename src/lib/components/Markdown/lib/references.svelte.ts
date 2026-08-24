import { entityMappers, type EntityType } from '$lib/components/EntitySearch/search.svelte'
import { isOnline } from '$lib/state/online.svelte'
import { queries } from '$lib/zero/queries'
import { createResource, type QueryResource } from '$lib/zero/resource.svelte'
import type { MarkdownReference, MarkdownReferencesIds } from './remark-references'

/**
 * Resolves the area/block/route/user ids referenced in a markdown string to
 * `{ type, id, name }` tuples, read reactively from Zero. Each kind is gated so
 * no query runs for a reference type that isn't present. Wraps `createResource`
 * the same way the entity resource factories do, but spans all four tables.
 *
 * Any requested id the query does not answer is surfaced as a placeholder rather than
 * left alone, since an unenriched token renders as literal `!blocks:12!` in the prose.
 * See {@link unresolved} for which placeholder, and why offline gets its own.
 */
export function markdownReferences(ids: () => MarkdownReferencesIds) {
  // Names via the entity mappers, so a reference to a nameless route renders the
  // `common_unnamed` placeholder and a nameless block its "Block <order>" label
  // rather than a link with no text.
  const map = entityMappers()

  const areas = createResource(
    () => queries.listAreas({ id: ids().areas }),
    (rows) => rows.map((row): MarkdownReference => ({ id: row.id, name: map.areas(row).label, type: 'areas' })),
    { enabled: () => ids().areas.length > 0 },
  )

  const blocks = createResource(
    () => queries.listBlocks({ blockId: ids().blocks }),
    (rows) => rows.map((row): MarkdownReference => ({ id: row.id, name: map.blocks(row).label, type: 'blocks' })),
    { enabled: () => ids().blocks.length > 0 },
  )

  const routes = createResource(
    () => queries.listRoutes({ routeId: ids().routes }),
    (rows) => rows.map((row): MarkdownReference => ({ id: row.id, name: map.routes(row).label, type: 'routes' })),
    { enabled: () => ids().routes.length > 0 },
  )

  // Users resolve by their (region-agnostic) ids already embedded in the
  // content — `usersByIds` is the by-id resolver, not the picker enumerator.
  const users = createResource(
    () => queries.usersByIds({ id: ids().users }),
    (rows) => rows.map((row): MarkdownReference => ({ id: row.id, name: row.username, type: 'users' })),
    { enabled: () => ids().users.length > 0 },
  )

  /**
   * Every requested id the query did not answer, labelled by why we think it did not.
   *
   * A completed result is authoritative: the id is not there because the target was deleted, so it
   * gets a tombstone. Offline nothing ever completes (Zero only calls a query complete once the
   * server says so, and re-earns that on every connect), so an id missing from the local replica
   * gets the softer "not available" instead: it may be perfectly alive, on a device that simply
   * never synced it.
   *
   * Still loading and online is neither: return nothing and let the name arrive. The alternative is
   * a placeholder that flashes in the middle of a sentence and is then replaced.
   *
   * Something must be emitted in both of the first two cases, because an unenriched `!blocks:12!`
   * does not match the render plugin's pattern at all and survives into the page as literal text.
   */
  const unresolved = (
    type: EntityType,
    requested: number[],
    resource: QueryResource<MarkdownReference[]>,
  ): MarkdownReference[] => {
    const offline = !isOnline()
    if (!resource.isComplete && !offline) return []
    return requested
      .filter((id) => !resource.data.some((ref) => ref.id === id))
      .map((id) => ({ id, missing: true, name: '', type, unavailable: !resource.isComplete }))
  }

  return {
    get data(): MarkdownReference[] {
      return [
        ...areas.data,
        ...blocks.data,
        ...routes.data,
        ...users.data,
        ...unresolved('areas', ids().areas, areas),
        ...unresolved('blocks', ids().blocks, blocks),
        ...unresolved('routes', ids().routes, routes),
        ...unresolved('users', ids().users, users),
      ]
    },
  }
}
