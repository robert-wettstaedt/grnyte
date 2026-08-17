/* eslint-disable svelte/prefer-svelte-reactivity -- these collections are rebuilt wholesale
   inside $derived (the new reference is the reactivity) and never mutated afterwards, and
   `eventEntityMap` is a pure function that has no reactive state to be. */
import { entityHref } from '$lib/components/EntitySearch/search.svelte'
import type { AreaDetail } from '$lib/entities/area/dto'
import { areaList } from '$lib/entities/area/resources.svelte'
import type { UserAscentDetail } from '$lib/entities/ascent/dto'
import { ascentsByIds } from '$lib/entities/ascent/resources.svelte'
import type { BlockDetail } from '$lib/entities/block/dto'
import { blockList } from '$lib/entities/block/resources.svelte'
import type { MediaFile } from '$lib/entities/file/dto'
import { filesByIds } from '$lib/entities/file/resources.svelte'
import type { RegionMembership } from '$lib/entities/region/dto'
import { regionCrumb } from '$lib/entities/region/mapper'
import type { RouteListItem } from '$lib/entities/route/dto'
import { routesByIds } from '$lib/entities/route/resources.svelte'
import type { TopoView } from '$lib/entities/topo/dto'
import { toposByBlockIds } from '$lib/entities/topo/resources.svelte'
import type { UserRef } from '$lib/entities/user/dto'
import { usersByIds } from '$lib/entities/user/resources.svelte'
import { decodeApproach } from '$lib/map/polyline'
import { getGlobalState } from '$lib/state/global.svelte'
import type { EventObjectType } from './dto'
import { eventEntityKey, type EventEntity, type EventEntityMap, type EventEntityRef } from './entity'

/**
 * The second pass the polymorphic `entityId` forces (see `entity.ts`): collect the ids a window
 * of activities points at, fetch them through the per-entity list resources, and join them in
 * memory into the map the cards read.
 *
 * One entry per entity kind, in {@link KINDS}. The kinds used to be spelled out in four parallel
 * lists (which ids to collect, which resource answers, which fetches count as settled, and how a
 * row becomes an entity), so a seventh kind meant four edits and a missing one showed up as a
 * card that pulsed forever. What is left outside the table is the resource wiring itself, which
 * cannot be table-driven because each resource takes its arguments in its own shape.
 *
 * The join is {@link eventEntityMap}, a pure function, and the readiness rule lives inside it
 * rather than in the wiring around it: deciding between "still syncing" (absent, a skeleton) and
 * "hydration finished without it" (an explicit `null`, a tombstone) is the interesting part, and
 * it is the part that used to be untestable.
 */

/** What {@link eventEntityMap} joins: the refs to resolve, and everything fetched for them. */
export interface EntityHydration {
  areas: readonly AreaDetail[]
  ascents: readonly UserAscentDetail[]
  blocks: readonly BlockDetail[]
  files: readonly MediaFile[]
  /**
   * The entity kinds whose fetch has settled. A ref of a kind that is not in here has not been
   * answered yet; one that is in here but missing from its list was answered with nothing.
   * {@link KINDS} says which other kinds a ref waits for on top of its own.
   */
  ready: ReadonlySet<EventObjectType>
  refs: readonly EventEntityRef[]
  routes: readonly RouteListItem[]
  /** Drives the region crumb, which only shows for a user who spans more than one region. */
  userRegions: RegionMembership[]
  users: readonly UserRef[]
}

export interface EntityHydrationResult {
  /** Hydrated entities keyed by {@link eventEntityKey}, ready to hand to the inbox. */
  readonly entities: EventEntityMap
  /**
   * The topo photos those rows changed, keyed by `topos.id`.
   *
   * Kept apart from {@link entities} because a topo is not an entity a row points at: the
   * row points at the block and names the photo in its metadata, and only the change line
   * (never a card row) renders one.
   */
  readonly topos: ReadonlyMap<number, TopoView>
}

/** What one kind of entity contributes to the join. */
interface EntityKind<Row> {
  /**
   * Kinds whose fetch must also have settled before a ref of this kind that resolved to nothing
   * can be called gone. An ascent's row is its route's, so an ascent whose route is still in
   * flight would otherwise flash a tombstone for something standing right there.
   */
  needs?: readonly EventObjectType[]
  /** Whether the table this kind lives in keys on a number. `files` keys on a cuid. */
  numeric: boolean
  /** The fetched rows, indexed by id as text, which is how an activity stores it. */
  rows: (input: EntityHydration) => ReadonlyMap<string, Row>
  /**
   * The row as a card renders it, or `undefined` when this row cannot stand on its own yet.
   *
   * `tables` is every kind's rows, already indexed for this join, for the one kind that borrows
   * another's row: an ascent renders its route's.
   */
  toEntity: (row: Row, input: EntityHydration, tables: JoinTables) => EventEntity | undefined
}

/**
 * Every kind's rows, indexed once per join.
 *
 * Typed as `never` rows on purpose: which map a lookup wants is `ref.type`, which no signature can
 * follow, and `kind()` has already checked that each `rows` and its own `toEntity` agree. So the
 * one place that needs the real row type casts for it, right where it knows the kind (see
 * `KINDS.ascent`), and everywhere else the map is opaque.
 */
type JoinTables = Record<EventObjectType, ReadonlyMap<string, never>>

/** Declares one kind, so `Row` is inferred from `rows` and checked against `toEntity`. */
function kind<Row>(spec: EntityKind<Row>): EntityKind<Row> {
  return spec
}

/**
 * The kinds, one entry each.
 *
 * Not held against a `Record<EventObjectType, ...>`: a constraint wide enough to accept six
 * differently shaped rows accepts anything, and the exhaustiveness is already checked where it
 * matters, by `KINDS[ref.type]` in {@link eventEntityMap}. A missing kind is an error there.
 */
const KINDS = {
  area: kind({
    numeric: true,
    rows: (input) => index(input.areas),
    toEntity: (area, input): EventEntity => ({
      crumbs: crumbs(input, area.regionFk, [area.areas.at(-1)?.name]),
      description: area.description,
      href: entityHref({ id: area.id, label: area.name, type: 'areas' }),
      name: area.name,
      paths: area.geoPaths.flatMap(decodeApproach),
      row: 'area',
    }),
  }),

  ascent: kind({
    needs: ['route'],
    numeric: true,
    rows: (input) => index(input.ascents),
    toEntity: (ascent, input, tables): EventEntity | undefined => {
      // The route carries the row (grade, stars, tags, topo thumb); reading those off the ascent
      // would render a real route with zeroed values, which is worse than late. Cast because this
      // is the one place that reads another kind's table and so knows which kind it is.
      const routes = tables.route as ReadonlyMap<string, RouteListItem>
      const route = routes.get(String(ascent.routeFk))
      if (route == null && !input.ready.has('route')) {
        return undefined
      }

      return {
        ...(route == null ? { name: ascent.routeName, row: 'none' as const } : routeEntity(route, input)),
        ascentGradeFk: ascent.gradeFk,
        ascentRating: ascent.rating,
        ascentType: ascent.type,
        climbedAt: ascent.dateTime,
        climberFk: ascent.createdBy,
        climberName: ascent.authorName,
        files: ascent.files,
        humidity: ascent.humidity,
        note: ascent.notes,
        temperature: ascent.temperature,
      }
    },
  }),

  block: kind({
    numeric: true,
    rows: (input) => index(input.blocks),
    toEntity: (block, input): EventEntity => ({
      crumbs: crumbs(input, block.regionFk, [block.areas.at(-1)?.name]),
      href: entityHref({ id: block.id, label: block.name, type: 'blocks' }),
      name: block.name,
      pin: block.geolocation,
      row: 'block',
      topoImagePath: block.topoImages[0]?.path,
    }),
  }),

  file: kind({
    numeric: false,
    rows: (input) => new Map(input.files.map((file) => [file.id, file])),
    // A file has no page of its own and its id is a cuid, so it contributes the photo and
    // nothing else: the card names the parent it landed on, hydrated alongside it.
    toEntity: (file): EventEntity => ({ files: [file], name: '', row: 'none' }),
  }),

  route: kind({
    numeric: true,
    rows: (input) => index(input.routes),
    toEntity: (route, input): EventEntity => routeEntity(route, input),
  }),

  user: kind({
    numeric: true,
    rows: (input) => index(input.users),
    toEntity: (user): EventEntity => ({
      // No breadcrumb: a person's region membership would read like a location path.
      crumbs: [],
      href: entityHref({ id: user.id, label: user.username, type: 'users' }),
      name: user.username,
      row: 'user',
    }),
  }),
}

/** Join fetched rows onto the refs that asked for them. Pure: see the module comment. */
export function eventEntityMap(input: EntityHydration): EventEntityMap {
  const entities = new Map<string, EventEntity | null>()
  // Indexed once for the whole join, not once per ref: a window of fifty rows asking fifty
  // questions of the same fetched rows would otherwise rebuild the same six maps fifty times,
  // on every tick that answers.
  const tables = indexed(input)

  for (const ref of input.refs) {
    const spec = KINDS[ref.type]
    const row = tables[ref.type].get(ref.id)
    const entity = row === undefined ? undefined : spec.toEntity(row, input, tables)

    if (entity != null) {
      entities.set(eventEntityKey(ref), entity)
    } else if (answered(input, ref)) {
      entities.set(eventEntityKey(ref), null)
    }
  }

  return entities
}

/**
 * Fetch and join a set of polymorphic `(entityType, entityId)` refs.
 *
 * Split from {@link activityEntities} because the feed is not the only screen that holds refs
 * rather than rows: the notification inbox stores the same pair for the same reason, and needs
 * the same names, breadcrumbs and links out of them.
 *
 * Reads `userRegions` off the global state, so call it during component initialisation like any
 * other resource factory.
 */
export function hydrateEntities(
  refsOf: () => readonly EventEntityRef[],
  /** Blocks whose topo photos are wanted. Only the feed's open cards draw any. */
  topoBlocks: () => readonly number[] = () => [],
): EntityHydrationResult {
  const global = getGlobalState()

  const refs = $derived(refsOf())
  // `entityId` is text for every kind; the numeric tables get the ids that survive parsing, so a
  // malformed row can't widen a query with a NaN.
  const idsOf = (type: EventObjectType) => {
    const ids = refs.flatMap((ref) => (ref.type === type ? [ref.id] : []))
    return KINDS[type].numeric ? [...new Set(ids.map(Number))].filter(Number.isInteger) : [...new Set(ids)]
  }

  const areaIds = $derived(idsOf('area').map(Number))
  const ascentIds = $derived(idsOf('ascent').map(Number))
  const blockIds = $derived(idsOf('block').map(Number))
  const fileIds = $derived(idsOf('file').map(String))
  const userIds = $derived(idsOf('user').map(Number))

  // One line per resource, because each takes its arguments in its own shape. This is the
  // adapter the table cannot absorb.
  const areas = areaList(() => ({ id: areaIds }))
  const ascents = ascentsByIds(() => ascentIds)
  const blocks = blockList(() => ({ blockId: blockIds }))
  const files = filesByIds(() => fileIds)
  const users = usersByIds(() => userIds)

  // An ascent card renders its route's row, so the ascents' routes join the route ids. It is a
  // second wave (the route ids arrive with the ascents), which `KINDS.ascent.needs` handles: the
  // re-targeted query reads as loading until it answers.
  const routeIds = $derived([
    ...new Set([...idsOf('route').map(Number), ...ascents.data.map((ascent) => ascent.routeFk)]),
  ])
  const routes = routesByIds(() => routeIds)

  // Topo lines are a second query rather than a wider `blockList`, so the screens that only need
  // a block's thumbnail keep paying for a thumbnail.
  const topoBlockIds = $derived([...new Set(topoBlocks())].filter(Number.isInteger))
  const topos = toposByBlockIds(() => topoBlockIds)

  const ready = $derived(
    new Set(
      (
        [
          ['area', areas],
          ['ascent', ascents],
          ['block', blocks],
          ['file', files],
          ['route', routes],
          ['user', users],
        ] as const
      ).flatMap(([type, resource]) => (resource.status === 'ready' ? [type] : [])),
    ),
  )

  const entities = $derived(
    eventEntityMap({
      areas: areas.data,
      ascents: ascents.data,
      blocks: blocks.data,
      files: files.data,
      ready,
      refs,
      routes: routes.data,
      userRegions: global.userRegions,
      users: users.data,
    }),
  )

  return {
    get entities() {
      return entities
    },
    get topos() {
      return topos.data
    },
  }
}

/**
 * Whether every fetch a ref depends on has settled: its own kind, and whatever that kind
 * declares it needs. Only then does an unresolved ref mean the entity is gone.
 */
function answered(input: EntityHydration, ref: EventEntityRef): boolean {
  return input.ready.has(ref.type) && (KINDS[ref.type].needs ?? []).every((dependency) => input.ready.has(dependency))
}

/**
 * Decoded approach paths, keyed by the polyline they came from.
 *
 * The hydration this feeds re-runs whenever any of its six resources answers, several times
 * during a load and again on every sync change, and it decoded every path from scratch each
 * time. Worse than the arithmetic, each run handed out fresh arrays, so the thumbnails saw new
 * `paths` for cards nothing had happened to and redrew their SVGs.
 *
 * Unbounded on purpose: the keys are the encoded strings a region's areas hold, so the ceiling
 * is that region's approach paths, and they are stable.
 *
 * ponytail: never evicted. Upgrade = an LRU if a session ever spans enough regions to matter.
 */
/** The region crumb, then whatever else the row leads with. */
function crumbs(input: EntityHydration, regionFk: null | number | undefined, rest: (null | string | undefined)[]) {
  return [regionCrumb(input.userRegions, regionFk), ...rest].filter((crumb): crumb is string => crumb != null)
}

/** Rows by their id as text, which is how an activity stores it. */
function index<T extends { id: number }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [String(row.id), row]))
}

/** Each kind's rows, indexed, keyed by kind. Built off `KINDS` itself, so a kind added there is
 *  indexed here without a second list to remember. */
function indexed(input: EntityHydration): JoinTables {
  const types = Object.keys(KINDS) as EventObjectType[]
  return Object.fromEntries(types.map((type) => [type, KINDS[type].rows(input)])) as JoinTables
}

/** The row an ascent borrows as well as the one a route renders for itself. */
function routeEntity(route: RouteListItem, input: EntityHydration): EventEntity {
  return {
    crumbs: crumbs(input, route.regionFk, [route.areaName, route.blockName]),
    href: entityHref({ id: route.id, label: route.name, type: 'routes' }),
    name: route.name,
    route,
    row: 'route',
  }
}
