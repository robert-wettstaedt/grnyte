import { resolve } from '$app/paths'
import type { IconName } from '$lib/components/Icon/icons'
import { toAreaListItem, type AreaAncestor } from '$lib/entities/area/mapper'
import { toBlockListItem } from '$lib/entities/block/mapper'
import { toRouteListItem, type RouteListRow } from '$lib/entities/route/mapper'
import { m } from '$lib/paraglide/messages'
import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'

/** A lightweight entity reference: the shape the `@` picker suggests and inserts,
 *  and what {@link entityHref} resolves to an in-app route. */
export interface EntityItem {
  id: number
  label: string
  type: EntityType
}

/** The searchable/linkable entity kinds. Markdown `!type:id!` references are one
 *  consumer of this union (see `remark-references`), not its owner. */
export type EntityType = 'areas' | 'blocks' | 'routes' | 'users'

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

/** The in-app route an entity links to, resolved by type. Shared by the `@`
 *  picker, the search-bar dropdown and the `?q=` results page so they can't drift. */
export function entityHref(item: EntityItem): string {
  switch (item.type) {
    case 'areas':
      return resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(item.id) })
    case 'blocks':
      return resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(item.id) })
    case 'routes':
      return resolve('/(app)/routes/[id]', { id: String(item.id) })
    case 'users':
      return resolve('/(app)/users/[id]', { id: String(item.id) })
  }
}

// Section order in the dropdown and the per-section cap. The cap is pushed into
// each Zero query as a `limit`, so only this many rows per type ever materialise.
const GROUP_ORDER: EntityType[] = ['users', 'areas', 'blocks', 'routes']
const PER_GROUP_LIMIT = 6

interface EntitySearchOptions {
  /** Per-type row cap pushed into each query as a `limit`; defaults to {@link PER_GROUP_LIMIT}. */
  limit?: number
  /** Only query while the picker is open — keeps it idle (and synced-down) otherwise. */
  open: () => boolean
  /** Current query (the text typed after the `@` trigger, or into the search bar). */
  query: () => string
  /**
   * When set, prepends a region name to each candidate's crumbs — used by the
   * global search when the signed-in user spans more than one region. Returning
   * `undefined` (or omitting the option) leaves crumbs untouched.
   */
  regionCrumb?: (regionFk: number) => string | undefined
  /** Regions to search users within; empty hides the People group. */
  regionFks: () => number[]
}
interface UserRow {
  id: number
  regionMemberships?: readonly { regionFk: number }[] | undefined
  username: string
}

/**
 * The context line under an entity row: an optional leading region crumb, then the
 * containment chain, with blanks dropped.
 *
 * Exported so the `?q=` results page builds the same line as the dropdown. An empty
 * segment has to go, not just a null one: a parent area with no name would otherwise
 * render as a stray separator between two crumbs.
 */
export function entityCrumbs(region: string | undefined, rest: Array<null | string | undefined>): string[] {
  return [region, ...rest].filter((crumb): crumb is string => crumb != null && crumb.length > 0)
}

/**
 * Row → candidate mappers, shared by the live search and the search flyout's
 * recent/new sections so their crumbs can't drift apart. `regionCrumb` prepends the
 * region name (used once a search spans more than one region); omitting it leaves
 * the crumbs bare.
 *
 * Labels and crumbs come from the entity mappers, never from `row.name`: those mappers
 * are what decide that a nameless route reads `common_unnamed` and a nameless block
 * reads "Block <order>", so a list formatting its own label would render a blank row.
 */
export function entityMappers(regionCrumb?: (regionFk: number) => string | undefined) {
  const crumbs = (regionFk: null | number | undefined, rest: Array<null | string | undefined>): string[] =>
    entityCrumbs(regionCrumb != null && regionFk != null ? regionCrumb(regionFk) : undefined, rest)

  return {
    areas: (row: AreaAncestor & { regionFk: number }): EntityCandidate => {
      const area = toAreaListItem(row)
      return {
        context: crumbs(row.regionFk, [area.areas.at(-1)?.name]),
        id: area.id,
        label: area.name,
        type: 'areas',
      }
    },

    blocks: (row: Parameters<typeof toBlockListItem>[0]): EntityCandidate => {
      const block = toBlockListItem(row)
      return {
        context: crumbs(block.regionFk, [block.areas.at(-1)?.name]),
        id: block.id,
        label: block.name,
        type: 'blocks',
      }
    },

    routes: (row: RouteListRow): EntityCandidate => {
      const route = toRouteListItem(row)
      return {
        context: crumbs(route.regionFk, [route.areaName, route.blockName]),
        id: route.id,
        label: route.name,
        type: 'routes',
      }
    },

    users: (row: UserRow): EntityCandidate => ({
      // A user isn't in one place, so its crumb is the region(s) it shares with the
      // searcher — only shown when `regionCrumb` opts in.
      context: crumbs(
        null,
        (row.regionMemberships ?? []).map((membership) => regionCrumb?.(membership.regionFk)),
      ),
      id: row.id,
      label: row.username,
      type: 'users',
    }),
  }
}

/**
 * Reactive entity search. The search term and a per-type `limit` are pushed
 * **into** the Zero queries (`content` ILIKE + `limit`), so each keystroke
 * materialises at most `PER_GROUP_LIMIT` rows per type rather than the whole
 * region — no client-side scan. Queries are gated on `open`, so nothing runs
 * (and `users` never syncs over the network) until the caller opts in.
 */
export function entitySearch({ limit, open, query, regionCrumb, regionFks }: EntitySearchOptions) {
  const perGroup = limit ?? PER_GROUP_LIMIT
  const map = entityMappers(regionCrumb)

  const areas = createResource(
    () => queries.listAreas({ content: query(), limit: perGroup }),
    (rows): EntityCandidate[] => rows.map(map.areas),
    { enabled: open },
  )

  const blocks = createResource(
    () => queries.listBlocks({ content: query(), limit: perGroup }),
    (rows): EntityCandidate[] => rows.map(map.blocks),
    { enabled: open },
  )

  const routes = createResource(
    () => queries.listRoutes({ content: query(), pageSize: perGroup, sort: 'rating', sortOrder: 'desc' }),
    (rows): EntityCandidate[] => rows.map(map.routes),
    { enabled: open },
  )

  const users = createResource(
    () => queries.listUsers({ content: query(), limit: perGroup, regionFks: regionFks() }),
    (rows): EntityCandidate[] => rows.map(map.users),
    { enabled: () => open() && regionFks().length > 0 },
  )

  const candidates = (): Record<EntityType, EntityCandidate[]> => ({
    areas: areas.data,
    blocks: blocks.data,
    routes: routes.data,
    users: users.data,
  })

  return {
    /** Flattened candidates in display order — drives keyboard navigation. */
    get flat(): EntityCandidate[] {
      return this.groups.flatMap((group) => group.items)
    },

    /** Non-empty groups, in section order (already filtered + capped by the queries). */
    get groups(): EntityGroup[] {
      const all = candidates()
      return GROUP_ORDER.map((type) => ({ items: all[type], key: type, label: entityGroupLabel(type) })).filter(
        (group) => group.items.length > 0,
      )
    },

    /**
     * Best-effort synchronous label lookup for rehydrating `!type:id!` tokens
     * from whatever the picker currently has loaded. Reliable id→name resolution
     * on load belongs to the render resolver (`markdownReferences`), not here.
     */
    resolveLabel(type: EntityType, id: string): string | undefined {
      const numericId = Number(id)
      return candidates()[type].find((item) => item.id === numericId)?.label
    },
  }
}
