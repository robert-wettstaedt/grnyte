import type { IconName } from '$lib/components/Icon/icons'
import type { AreaDetail } from '$lib/entities/area/dto'
import { areaList } from '$lib/entities/area/resources.svelte'
import type { BlockListItem } from '$lib/entities/block/dto'
import { blockList } from '$lib/entities/block/resources.svelte'
import type { DisplayName } from '$lib/entities/displayName'
import type { EntityKind } from '$lib/entities/href'
import type { RouteListItem } from '$lib/entities/route/dto'
import { routeList } from '$lib/entities/route/resources.svelte'
import type { UserListItem } from '$lib/entities/user/dto'
import { userList } from '$lib/entities/user/resources.svelte'
import { m } from '$lib/paraglide/messages'
import { quietly } from '$lib/state/pill.svelte'
import { expectingMore, type QueryPhase } from '$lib/zero/resource.svelte'

/** A lightweight entity reference: the shape the `@` picker suggests and inserts. */
export interface EntityItem {
  id: number
  label: string
  type: EntityType
}

/** The searchable/linkable entity kinds. Markdown `!type:id!` references are one
 *  consumer of this union (see `remark-references`), not its owner.
 *
 *  Narrowed from {@link EntityKind} rather than spelled again, so the two cannot drift. */
export type EntityType = Extract<EntityKind, 'areas' | 'blocks' | 'routes' | 'users'>

/** Leading icon per entity type. Shared by the `@` picker list, the search-bar
 *  dropdown and the search-results page so their row visuals can't drift. */
export const ENTITY_TYPE_ICON: Record<EntityType, IconName> = {
  areas: 'area',
  blocks: 'block',
  routes: 'route',
  users: 'user',
}

/** A picker candidate: an entity plus an optional context line (one crumb, or a crumb path). */
export interface EntityCandidate extends EntityItem {
  context?: string | string[]
}

/** One rendered section of a candidate list: the live search groups by entity type,
 *  the flyout's recent/new sections mix types under one heading. */
export interface EntityGroup {
  items: EntityCandidate[]
  /** Stable list key. */
  key: string
  /** Section heading, already localised. */
  label: string
  /** When set, the heading carries a Clear button wired to this. Only a section built
   *  from something persisted (the viewed-entity list) has anything to clear. */
  onclear?: () => void
}

/** Localised section heading per entity type. Shared by the same lists. */
export function entityGroupLabel(type: EntityType): string {
  switch (type) {
    case 'areas':
      return m.editor_groupAreas()
    case 'blocks':
      return m.editor_groupBlocks()
    case 'routes':
      return m.editor_groupRoutes()
    case 'users':
      return m.editor_groupPeople()
  }
}

// Section order in the dropdown and the per-section cap. Only the capped hits per type read their related rows.
const GROUP_ORDER: EntityType[] = ['users', 'areas', 'blocks', 'routes']
const PER_GROUP_LIMIT = 6

export type SearchOutcome = 'answered' | 'error' | 'pending' | 'unavailable'

interface EntitySearchOptions {
  /** Per-type row cap; defaults to {@link PER_GROUP_LIMIT}. */
  limit?: number
  /** Only query while the picker is open. */
  open: () => boolean
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
 * The query text, settled. Closing clears it, so a reopened picker never registers the previous
 * term; typing waits, because only the value that is still there is worth a round trip.
 *
 * The getter reads nothing but `settled`. Deriving it from `query` would put `query` in the REQUEST's
 * dependencies, and `createResource` rebuilds on a dependency changing rather than on the value
 * changing, leaking the $effect.root each discarded `Query` opened.
 *
 * No leading edge: the queries register during render and this lands a tick later, so publishing
 * the first character early adds a term rather than replacing the empty one. Measured, not assumed.
 */
export function debouncedQuery(query: () => string, ms: number, open: () => boolean): () => string {
  let settled = $state(query())

  // Deliberately never reads `settled`, so writing it cannot re-trigger this effect.
  $effect(() => {
    // Clearing on CLOSE rather than on reopen is what keeps the stale term from ever being read:
    // reopening is a later gesture, so this has long since landed by then.
    const next = open() ? query() : ''

    if (next === '') {
      settled = ''
      return
    }

    const timer = setTimeout(() => (settled = next), ms)
    return () => clearTimeout(timer)
  })

  return () => settled
}

/**
 * The context line under an entity row: an optional leading region crumb, then the
 * containment chain, with blanks dropped.
 *
 * Exported so the `?q=` results page builds the same line as the dropdown. Every segment is a
 * `DisplayName` minted by its mapper, so absent is the only case left to drop: it used to drop
 * empty ones too, which made a nameless area vanish rather than read "Unnamed".
 *
 * Not `crumb is DisplayName`: a user-defined predicate ASSERTS the narrowing, laundering a raw
 * string exactly like a cast. The inferred predicate does not.
 */
export function entityCrumbs(
  region: DisplayName | undefined,
  rest: Array<DisplayName | null | undefined>,
): DisplayName[] {
  return [region, ...rest].filter((crumb) => crumb != null)
}

/**
 * Entity → candidate mappers, shared by the live search and the search flyout's
 * recent/new sections so their crumbs can't drift apart. `regionCrumb` prepends the
 * region name (used once a search spans more than one region); omitting it leaves
 * the crumbs bare. Labels are the DTOs' display names, so a nameless block reads "Block <order>".
 */
export function entityMappers(regionCrumb?: (regionFk: number) => DisplayName | undefined) {
  const crumbs = (regionFk: null | number | undefined, rest: Array<DisplayName | null | undefined>): DisplayName[] =>
    entityCrumbs(regionCrumb != null && regionFk != null ? regionCrumb(regionFk) : undefined, rest)

  return {
    areas: (area: AreaDetail): EntityCandidate => ({
      context: crumbs(area.regionFk, [area.areas.at(-1)?.name]),
      id: area.id,
      label: area.name,
      type: 'areas',
    }),

    blocks: (block: BlockListItem): EntityCandidate => ({
      context: crumbs(block.regionFk, [block.areas.at(-1)?.name]),
      id: block.id,
      label: block.name,
      type: 'blocks',
    }),

    routes: (route: RouteListItem): EntityCandidate => ({
      context: crumbs(route.regionFk, [route.areaName, route.blockName]),
      id: route.id,
      label: route.name,
      type: 'routes',
    }),

    users: (user: UserListItem): EntityCandidate => ({
      // A user isn't in one place, so its crumb is the region(s) it shares with the
      // searcher: only shown when `regionCrumb` opts in.
      context: crumbs(
        null,
        user.regionFks.map((regionFk) => regionCrumb?.(regionFk)),
      ),
      id: user.id,
      label: user.username,
      type: 'users',
    }),
  }
}

/**
 * Reactive entity search over the synced rows: each type matches its bare rows in JS and reads only its first
 * `limit` hits in full. Nothing runs (and no user list is read) until the caller opens it.
 */
export function entitySearch({ limit, open, query, regionCrumb, regionFks }: EntitySearchOptions) {
  const perGroup = limit ?? PER_GROUP_LIMIT
  const map = entityMappers(regionCrumb)

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
      if (placed.length === 0 && loading) return shown
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

/** Where each result group goes: shown ones keep their place and a later one goes below them, never
 *  above the rows being read. Groups arriving together take the usual section order. */
export function placeGroups(placed: readonly EntityType[], present: readonly EntityType[]): EntityType[] {
  return [...placed, ...GROUP_ORDER.filter((type) => present.includes(type) && !placed.includes(type))]
}

/** One verdict for every search surface: "no matches" only once every source answered. */
export function searchOutcome(phases: readonly QueryPhase[]): SearchOutcome {
  if (phases.some(expectingMore)) return 'pending'
  if (phases.some((phase) => phase.kind === 'error')) return 'error'
  return phases.every((phase) => phase.kind === 'answered') ? 'answered' : 'unavailable'
}

/** The phases a search waits on. Users only with a region to search, otherwise that query never runs. */
export function sources(
  areas: { phase: QueryPhase },
  blocks: { phase: QueryPhase },
  routes: { phase: QueryPhase },
  users: { phase: QueryPhase },
  withUsers: boolean,
): QueryPhase[] {
  return [areas, blocks, routes, ...(withUsers ? [users] : [])].map(({ phase }) => phase)
}
