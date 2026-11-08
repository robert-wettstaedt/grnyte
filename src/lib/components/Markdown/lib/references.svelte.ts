import { entityMappers, type EntityType } from '$lib/components/EntitySearch/search.svelte'
import { areaList } from '$lib/entities/area/resources.svelte'
import { blockList } from '$lib/entities/block/resources.svelte'
import { routesByIds } from '$lib/entities/route/resources.svelte'
import { usersByIds } from '$lib/entities/user/resources.svelte'
import { quietly } from '$lib/state/pill.svelte'
import { expectingMore, type QueryResource } from '$lib/zero/resource.svelte'
import type { MarkdownReference, MarkdownReferencesIds } from './remark-references'

/**
 * Resolves the area/block/route/user ids referenced in a markdown string to
 * `{ type, id, name }` tuples, read reactively from the synced rows. Each kind is gated so
 * no query runs for a reference type that isn't present.
 *
 * Any requested id the query does not answer is surfaced as a placeholder rather than
 * left alone, since an unenriched token renders as literal `!blocks:12!` in the prose.
 * See {@link unresolved} for which placeholder, and why offline gets its own.
 */
export function markdownReferences(ids: () => MarkdownReferencesIds) {
  // Quietly: a reference resolving in prose says nothing about the screen, so it never holds its pill.
  return quietly(() => resolveReferences(ids))
}

/** A resource's rows as references of one type, its phase unchanged. */
function referencesOf<T extends { id: number }>(
  type: EntityType,
  resource: QueryResource<T[]>,
  name: (item: T) => string,
): QueryResource<MarkdownReference[]> {
  return {
    get data() {
      return resource.data.map((item) => ({ id: item.id, name: name(item), type }))
    },
    get phase() {
      return resource.phase
    },
  }
}

function resolveReferences(ids: () => MarkdownReferencesIds) {
  // Names via the entity mappers, so a reference to a nameless route renders the
  // `common_unnamed` placeholder and a nameless block its "Block <order>" label
  // rather than a link with no text.
  const map = entityMappers()

  const areas = referencesOf(
    'areas',
    areaList(() => ({ id: ids().areas }), { enabled: () => ids().areas.length > 0 }),
    (area) => map.areas(area).label,
  )
  const blocks = referencesOf(
    'blocks',
    blockList(() => ({ blockId: ids().blocks }), { enabled: () => ids().blocks.length > 0 }),
    (block) => map.blocks(block).label,
  )
  const routes = referencesOf(
    'routes',
    routesByIds(() => ids().routes),
    (route) => map.routes(route).label,
  )
  // Users resolve by their (region-agnostic) ids already embedded in the
  // content: `usersByIds` is the by-id resolver, not the picker enumerator.
  const users = referencesOf(
    'users',
    usersByIds(() => ids().users),
    (user) => user.username,
  )

  /**
   * Every requested id the query did not answer, labelled by why we think it did not.
   *
   * An answered result is authoritative: the id is not there because the target was deleted, so it
   * gets a tombstone. A store that never synced does not answer, so an id missing from it gets the
   * softer "not available" instead: it may be perfectly alive, on a device that never synced it.
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
    // Still coming: emit nothing rather than a placeholder that flashes mid-sentence. Every other
    // phase (partial and error too) must emit one, or the raw token renders as text.
    if (expectingMore(resource.phase)) return []

    // Offline, a stream that ever synced answers from disk, so a synced guidebook still tombstones.
    const authoritative = resource.phase.kind === 'answered'

    return requested
      .filter((id) => !resource.data.some((ref) => ref.id === id))
      .map((id) => ({ id, missing: true, name: '', type, unavailable: !authoritative }))
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
