import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { entityMappers, type EntityCandidate, type EntityType } from './search.svelte'

// What the search flyout offers before anything is typed: the entities this browser
// opened last, and the newest ones in the user's regions. Both resolve their labels
// through Zero (only ids are stored), so a rename or a delete can't leave a stale row.

/** Exported for the tests, which assert against the real slot rather than guessing at one. */
export const VIEWED_KEY = `${PUBLIC_APPLICATION_NAME}:viewedEntities`

const VIEWED_CAP = 5
const NEW_LIMIT = 3
const TYPES: EntityType[] = ['areas', 'blocks', 'routes', 'users']

/** A stored view: the entity's type and id, nothing that can go stale. */
export interface EntityRef {
  id: number
  type: EntityType
}

const refKey = (ref: EntityRef): string => `${ref.type}:${ref.id}`

const parseRef = (raw: unknown): EntityRef | undefined => {
  if (typeof raw !== 'string') {
    return undefined
  }
  const [type, id] = raw.split(':')
  const numericId = Number(id)
  return TYPES.includes(type as EntityType) && Number.isInteger(numericId) && numericId > 0
    ? { id: numericId, type: type as EntityType }
    : undefined
}

interface SectionOptions {
  /** Only query while the flyout is open on its empty state. */
  enabled: () => boolean
  /** Prepends a region name to each candidate's crumbs; see {@link entityMappers}. */
  regionCrumb?: (regionFk: number) => string | undefined
}

/** Forget every stored view. The flyout offers this because the list names places and
 *  people by name, which is not something a borrowed browser should keep showing. */
export function clearViewed(): void {
  try {
    localStorage.removeItem(VIEWED_KEY)
  } catch {
    // Storage refused the delete. Nothing stored can be read either, so there is
    // nothing left to leak; the caller has already dropped its in-memory copy.
  }
}

/** The entities opened most recently on this browser, newest first. */
export function loadViewed(): EntityRef[] {
  if (typeof localStorage === 'undefined') {
    return []
  }
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(VIEWED_KEY) ?? '[]')
    return Array.isArray(raw)
      ? raw
          .map(parseRef)
          .filter((ref): ref is EntityRef => ref != null)
          .slice(0, VIEWED_CAP)
      : []
  } catch {
    return []
  }
}

/**
 * The newest areas, blocks and routes across the user's regions, which is what the
 * activity feed would show if ascents and edits weren't burying it. No time window:
 * ordering alone never renders an empty section in a quiet region, and reads the same.
 */
export function newEntities({
  enabled,
  exclude,
  limit = NEW_LIMIT,
  regionCrumb,
}: SectionOptions & { exclude?: () => EntityRef[]; limit?: number }) {
  const map = entityMappers(regionCrumb)

  const skip = () => exclude?.() ?? []

  // Over-fetch by whatever the `exclude` can eat. Filtering after a query capped at
  // `limit` would let three just-opened routes empty the routes out of the section
  // entirely, rather than backfilling with the next-newest ones.
  const fetchLimit = () => limit + skip().length

  const areas = createResource(
    () => queries.listAreas({ limit: fetchLimit(), sort: 'createdAt' }),
    (rows) => rows.map((row) => ({ createdAt: row.createdAt, item: map.areas(row) })),
    { enabled },
  )

  const blocks = createResource(
    () => queries.listBlocks({ limit: fetchLimit(), sort: 'createdAt' }),
    (rows) => rows.map((row) => ({ createdAt: row.createdAt, item: map.blocks(row) })),
    { enabled },
  )

  const routes = createResource(
    () => queries.listRoutes({ pageSize: fetchLimit(), sort: 'createdAt', sortOrder: 'desc' }),
    (rows) => rows.map((row) => ({ createdAt: row.createdAt, item: map.routes(row) })),
    { enabled },
  )

  return {
    /** The newest `limit` rows overall. Zero can't union across tables, so each query
     *  brings its own newest rows and the final cut happens here, after dropping the
     *  `exclude`d ones so a just-opened entity doesn't print in two sections. */
    get items(): EntityCandidate[] {
      const excluded = skip()
      return [...areas.data, ...blocks.data, ...routes.data]
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .filter((entry) => !excluded.some((ref) => ref.type === entry.item.type && ref.id === entry.item.id))
        .slice(0, limit)
        .map((entry) => entry.item)
    },
  }
}

/**
 * The stored views, hydrated into candidates. Ids that Zero can't resolve (deleted, or
 * in a region the user has since left) simply drop out of the list.
 */
export function recentlyViewed({
  enabled,
  refs,
  regionCrumb,
  regionFks,
}: SectionOptions & { refs: () => EntityRef[]; regionFks: () => number[] }) {
  const map = entityMappers(regionCrumb)

  const idsOf = (type: EntityType): number[] =>
    refs()
      .filter((ref) => ref.type === type)
      .map((ref) => ref.id)
  const hasIds = (type: EntityType) => () => enabled() && idsOf(type).length > 0

  const areas = createResource(
    () => queries.listAreas({ id: idsOf('areas') }),
    (rows): EntityCandidate[] => rows.map(map.areas),
    { enabled: hasIds('areas') },
  )

  const blocks = createResource(
    () => queries.listBlocks({ blockId: idsOf('blocks') }),
    (rows): EntityCandidate[] => rows.map(map.blocks),
    { enabled: hasIds('blocks') },
  )

  const routes = createResource(
    () => queries.listRoutes({ routeId: idsOf('routes') }),
    (rows): EntityCandidate[] => rows.map(map.routes),
    { enabled: hasIds('routes') },
  )

  const users = createResource(
    () => queries.listUsers({ ids: idsOf('users'), regionFks: regionFks() }),
    (rows): EntityCandidate[] => rows.map(map.users),
    { enabled: () => hasIds('users')() && regionFks().length > 0 },
  )

  return {
    /** Candidates in most-recently-opened order (the queries return them sorted by name). */
    get items(): EntityCandidate[] {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local lookup, rebuilt on every read
      const byKey = new Map(
        [...areas.data, ...blocks.data, ...routes.data, ...users.data].map((item) => [refKey(item), item]),
      )
      return refs()
        .map((ref) => byKey.get(refKey(ref)))
        .filter((item): item is EntityCandidate => item != null)
    },
  }
}

/**
 * Remember that an entity was opened, newest first.
 *
 * The write is guarded like every other one in the app: `typeof localStorage` is still
 * `'object'` in a browser that blocks site data, and it is `setItem` that throws there.
 * An unguarded throw would come out of the caller's `$effect` and blank the detail page,
 * which is a steep price for a dropdown section.
 */
export function recordView(ref: EntityRef): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  const next = [ref, ...loadViewed().filter((item) => refKey(item) !== refKey(ref))].slice(0, VIEWED_CAP)
  try {
    localStorage.setItem(VIEWED_KEY, JSON.stringify(next.map(refKey)))
  } catch {
    // Storage refused the write. The section just stays as it was, which is invisible
    // next to losing the page the reader actually asked for.
  }
}

/**
 * Record the open entity for the search flyout's "recently viewed" section.
 *
 * Detail pages call this instead of writing their own effect. Recorded off the loaded row,
 * so an id that 404s (or that the user may not read) never lands in the list, and keyed on
 * the id alone: the DTO behind it is rebuilt on every unrelated sync (an ascent logged, a
 * tag added), and re-reading and rewriting storage for each of those buys nothing.
 */
export function trackView(type: EntityType, id: () => number | undefined): void {
  const current = $derived(id())

  $effect(() => {
    if (current != null) {
      recordView({ id: current, type })
    }
  })
}
