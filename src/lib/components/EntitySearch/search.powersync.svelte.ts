import { areaList } from '$lib/entities/area/resources.powersync.svelte'
import { blockList } from '$lib/entities/block/resources.powersync.svelte'
import type { DisplayName } from '$lib/entities/displayName'
import { routeList } from '$lib/entities/route/resources.powersync.svelte'
import { userList } from '$lib/entities/user/resources.powersync.svelte'
import { quietly } from '$lib/state/pill.svelte'
import { entityItemMappers } from './entityItems'
import {
  entityGroupLabel,
  placeGroups,
  searchOutcome,
  sources,
  type EntityCandidate,
  type EntityGroup,
  type EntityType,
  type SearchOutcome,
} from './search.svelte'

// Only `entitySearch` reads differently on PowerSync; everything else is Zero's module, re-exported unchanged.
export {
  debouncedQuery,
  ENTITY_TYPE_ICON,
  type EntityCandidate,
  entityCrumbs,
  type EntityGroup,
  entityGroupLabel,
  type EntityItem,
  entityMappers,
  type EntityType,
  placeGroups,
  searchOutcome,
  type SearchOutcome,
  searchReady,
  sources,
} from './search.svelte'

// Section order in the dropdown and the per-section cap. Only the capped hits per type read their related rows.
const GROUP_ORDER: EntityType[] = ['users', 'areas', 'blocks', 'routes']
const PER_GROUP_LIMIT = 6

interface EntitySearchOptions {
  /** Per-type row cap; defaults to {@link PER_GROUP_LIMIT}. */
  limit?: number
  /** Only query while the picker is open. */
  open: () => boolean
  /** Zero only: how its debounced search treats an empty term. Local reads need no such hold. */
  opensEmpty?: boolean
  /** Current query (the text typed after the `@` trigger, or into the search bar). */
  query: () => string
  /**
   * When set, prepends a region name to each candidate's crumbs: used by the
   * global search when the signed-in user spans more than one region. Returning
   * `undefined` (or omitting the option) leaves crumbs untouched.
   */
  regionCrumb?: (regionFk: number) => DisplayName | undefined
  /** Regions to search users within; empty hides the People group. */
  regionFks: () => number[]
}

/**
 * Reactive entity search over the synced rows: each type matches its bare rows in JS and reads only its first
 * `limit` hits in full. Nothing runs (and no user list is read) until the caller opens it.
 */
export function entitySearch({ limit, open, query, regionCrumb, regionFks }: EntitySearchOptions) {
  const perGroup = limit ?? PER_GROUP_LIMIT
  const map = entityItemMappers(regionCrumb)

  // Quietly: a search list has its own loading state, so it never holds the screen's pill.
  const { areas, blocks, routes, users } = quietly(() => ({
    areas: areaList(() => ({ content: query(), limit: perGroup }), { enabled: open }),
    blocks: blockList(() => ({ content: query(), limit: perGroup }), { enabled: open }),
    routes: routeList(() => ({ content: query(), pageSize: perGroup, sort: 'rating', sortOrder: 'desc' }), {
      enabled: open,
    }),
    users: userList(() => ({ content: query(), limit: perGroup, regionFks: regionFks() }), {
      enabled: () => open() && regionFks().length > 0,
    }),
  }))

  // The groups this term has shown so far, in the order they first did. Plain variables: they are
  // bookkeeping read while rendering, never a reason to render again.
  let placed: EntityType[] = []
  let placedTerm: string | undefined
  let shown: EntityGroup[] = []
  let shownTerm = ''
  // `groups` is read only while open, so a close is seen here: the next opening starts from nothing.
  $effect(() => {
    if (open()) return
    shown = []
    shownTerm = ''
  })

  const candidates = $derived<Record<EntityType, EntityCandidate[]>>({
    areas: areas.data.map(map.areas),
    blocks: blocks.data.map(map.blocks),
    routes: routes.data.map(map.routes),
    users: users.data.map(map.users),
  })

  return {
    /** Flattened candidates in display order: drives keyboard navigation. */
    get flat(): EntityCandidate[] {
      return this.groups.flatMap((group) => group.items)
    },

    /** Non-empty groups, in the order they arrived for this term (already filtered + capped). */
    get groups(): EntityGroup[] {
      const all = candidates
      if (placedTerm !== query()) {
        placed = []
        placedTerm = query()
      }
      // Local reads answer a frame apart: a term's first groups wait until none has nothing on hand, so they take
      // the usual order rather than arrival order. The previous term's groups stay up meanwhile.
      const loading = sources(areas, blocks, routes, users, regionFks().length > 0).some(
        (phase) => phase.kind === 'loading',
      )
      // Only for the same search typed on: another term, or a reopen, never sees the previous results.
      const term = query()
      if (placed.length === 0 && loading) {
        const related = term.startsWith(shownTerm) || shownTerm.startsWith(term)
        return open() && shownTerm !== '' && term !== '' && related ? shown : []
      }
      shownTerm = term
      placed = placeGroups(
        placed,
        GROUP_ORDER.filter((type) => all[type].length > 0),
      )
      shown = placed
        .filter((type) => all[type].length > 0)
        .map((type) => ({ items: all[type], key: type, label: entityGroupLabel(type) }))
      return shown
    },

    /** What an empty result means; see {@link searchOutcome}. */
    get outcome(): SearchOutcome {
      return searchOutcome(sources(areas, blocks, routes, users, regionFks().length > 0))
    },

    /**
     * Best-effort synchronous label lookup for rehydrating `!type:id!` tokens
     * from whatever the picker currently has loaded. Reliable id→name resolution
     * on load belongs to the render resolver (`markdownReferences`), not here.
     */
    resolveLabel(type: EntityType, id: string): string | undefined {
      const numericId = Number(id)
      return candidates[type].find((item) => item.id === numericId)?.label
    },
  }
}
