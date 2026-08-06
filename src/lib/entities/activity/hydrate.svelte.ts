/* eslint-disable svelte/prefer-svelte-reactivity -- these collections are rebuilt wholesale
   inside $derived (the new reference is the reactivity) and never mutated afterwards, and
   `activityEntityMap` is a pure function that has no reactive state to be. */
/**
 * The second pass the polymorphic `entityId` forces (see `entity.ts`): collect the ids a
 * window of activities points at, fetch them through the per-entity list resources, and
 * join them in memory into the map the cards read.
 *
 * The join itself is {@link activityEntityMap}, a pure function, because the interesting
 * part is not the fetching: it is deciding, per ref, between "still syncing" (absent, a
 * skeleton) and "hydration finished without it" (an explicit `null`, a tombstone).
 */
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
import { parseTopoChange } from '$lib/entities/topo/change'
import type { TopoView } from '$lib/entities/topo/dto'
import { toposByBlockIds } from '$lib/entities/topo/resources.svelte'
import type { UserRef } from '$lib/entities/user/dto'
import { usersByIds } from '$lib/entities/user/resources.svelte'
import type { Coords } from '$lib/map/map'
import { decodePath } from '$lib/map/polyline'
import { getGlobalState } from '$lib/state/global.svelte'
import type { ActivityEntityType, ActivityListItem } from './dto'
import {
  activityEntityKey,
  activityHydrationRefs,
  type ActivityEntity,
  type ActivityEntityMap,
  type ActivityEntityRef,
} from './entity'

/** What {@link activityEntityMap} joins: the refs to resolve, and everything fetched for them. */
export interface ActivityHydration {
  areas: readonly AreaDetail[]
  ascents: readonly UserAscentDetail[]
  blocks: readonly BlockDetail[]
  files: readonly MediaFile[]
  /**
   * The entity kinds whose fetch has settled. A ref of a kind that is not in here has not
   * been answered yet and renders as a skeleton; one that is in here but missing from its
   * list was answered with nothing, so it is gone, and renders as a tombstone.
   */
  ready: ReadonlySet<ActivityEntityType>
  refs: readonly ActivityEntityRef[]
  routes: readonly RouteListItem[]
  /** Drives the region crumb, which only shows for a user who spans more than one region. */
  userRegions: RegionMembership[]
  users: readonly UserRef[]
}

export interface ActivityHydrationResult {
  /** Hydrated entities keyed by {@link activityEntityKey}, ready to hand to `ActivityFeed`. */
  readonly entities: ActivityEntityMap
  /**
   * The topo photos those rows changed, keyed by `topos.id`.
   *
   * Kept apart from {@link entities} because a topo is not an entity a row points at: the
   * row points at the block and names the photo in its metadata, and only the change line
   * (never a card row) renders one.
   */
  readonly topos: ReadonlyMap<number, TopoView>
}

/**
 * Fetch and join the entities a window of activities points at.
 *
 * Reads `userRegions` off the global state, so call it during component initialisation
 * like any other resource factory.
 */
export function activityEntities(
  activities: () => readonly ActivityListItem[],
  /**
   * The rows whose cards are open. Only those pull topo photos: a photo is drawn by the
   * change list alone, which lives behind the card's own toggle, so syncing the whole topo
   * tree of every block in the window would charge a reader who never expands anything, and
   * charge them again on each "load older".
   */
  expanded: () => readonly ActivityListItem[] = () => [],
): ActivityHydrationResult {
  const global = getGlobalState()

  const refs = $derived(activityHydrationRefs(activities()))
  // `entityId` is text for every kind; the numeric tables get the ids that survive parsing,
  // so a malformed row can't widen a query with a NaN.
  const uniqueIds = (ids: readonly string[]) => [...new Set(ids.map(Number))].filter(Number.isInteger)
  const numericIds = (type: ActivityEntityType) => uniqueIds(refs.flatMap((ref) => (ref.type === type ? [ref.id] : [])))

  const areaIds = $derived(numericIds('area'))
  const ascentIds = $derived(numericIds('ascent'))
  const blockIds = $derived(numericIds('block'))
  const fileIds = $derived(refs.flatMap((ref) => (ref.type === 'file' ? [ref.id] : [])))
  const userIds = $derived(numericIds('user'))

  const areas = areaList(() => ({ id: areaIds }))
  const ascents = ascentsByIds(() => ascentIds)
  const blocks = blockList(() => ({ blockId: blockIds }))
  const files = filesByIds(() => fileIds)
  const users = usersByIds(() => userIds)

  // An ascent card renders its route's row, so the ascents' routes join the route ids. It
  // is a second wave (the route ids arrive with the ascents), which the `ready` set already
  // handles: the re-targeted query reads as loading until it answers.
  const routeIds = $derived([...new Set([...numericIds('route'), ...ascents.data.map((ascent) => ascent.routeFk)])])
  const routes = routesByIds(() => routeIds)

  // The blocks whose open rows say a topo photo changed. Their lines are a second query
  // rather than a wider `blockList`, so the screens that only need a block's thumbnail keep
  // paying for a thumbnail.
  const topoBlockIds = $derived(
    uniqueIds(
      expanded().flatMap((activity) =>
        activity.entityType === 'block' && parseTopoChange(activity.metadata) != null ? [activity.entityId] : [],
      ),
    ),
  )
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
    activityEntityMap({
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

/** Join fetched rows onto the refs that asked for them. Pure: see the module comment. */
export function activityEntityMap(input: ActivityHydration): ActivityEntityMap {
  const areas = index(input.areas)
  const ascents = index(input.ascents)
  const blocks = index(input.blocks)
  const routes = index(input.routes)
  const users = index(input.users)
  const files = new Map(input.files.map((file) => [file.id, file]))

  const crumbs = (regionFk: null | number | undefined, rest: (null | string | undefined)[]): string[] =>
    [regionCrumb(input.userRegions, regionFk), ...rest].filter((crumb): crumb is string => crumb != null)

  const routeEntity = (route: RouteListItem): ActivityEntity => ({
    crumbs: crumbs(route.regionFk, [route.areaName, route.blockName]),
    href: entityHref({ id: route.id, label: route.name, type: 'routes' }),
    name: route.name,
    route,
    row: 'route',
  })

  /** `undefined` = not answered yet, `null` = answered with nothing. */
  const entityOf = (ref: ActivityEntityRef): ActivityEntity | null | undefined => {
    switch (ref.type) {
      case 'area': {
        const area = areas.get(ref.id)
        return area == null
          ? undefined
          : {
              crumbs: crumbs(area.regionFk, [area.areas.at(-1)?.name]),
              description: area.description,
              href: entityHref({ id: area.id, label: area.name, type: 'areas' }),
              name: area.name,
              paths: area.geoPaths.flatMap(decodeApproach),
              row: 'area',
            }
      }

      case 'ascent': {
        const ascent = ascents.get(ref.id)
        if (ascent == null) {
          return undefined
        }

        // The route carries the row (grade, stars, tags, topo thumb); reading those off the
        // ascent would render a real route with zeroed values, which is worse than late.
        const route = routes.get(String(ascent.routeFk))
        if (route == null && !input.ready.has('route')) {
          return undefined
        }

        return {
          ...(route == null ? { name: ascent.routeName, row: 'none' as const } : routeEntity(route)),
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
      }

      case 'block': {
        const block = blocks.get(ref.id)
        return block == null
          ? undefined
          : {
              crumbs: crumbs(block.regionFk, [block.areas.at(-1)?.name]),
              href: entityHref({ id: block.id, label: block.name, type: 'blocks' }),
              name: block.name,
              pin: block.geolocation,
              row: 'block',
              topoImagePath: block.topoImages[0]?.path,
            }
      }

      case 'file': {
        const file = files.get(ref.id)
        // A file has no page of its own and its id is a cuid, so it contributes the photo
        // and nothing else: the card names the parent it landed on, hydrated alongside it.
        return file == null ? undefined : { files: [file], name: '', row: 'none' }
      }

      case 'route': {
        const route = routes.get(ref.id)
        return route == null ? undefined : routeEntity(route)
      }

      case 'user': {
        const user = users.get(ref.id)
        return user == null
          ? undefined
          : {
              // No breadcrumb: a person's region membership would read like a location path.
              crumbs: [],
              href: entityHref({ id: user.id, label: user.username, type: 'users' }),
              name: user.username,
              row: 'user',
            }
      }
    }
  }

  /**
   * Whether every fetch a ref depends on has settled. An ascent depends on the routes as
   * well as the ascents, and only once both have answered does an unresolved one mean it
   * is gone: without that, an ascent would flash a "deleted" tombstone for the tick its
   * route spends in flight.
   */
  const answered = (ref: ActivityEntityRef) =>
    input.ready.has(ref.type) && (ref.type !== 'ascent' || input.ready.has('route'))

  const entities = new Map<string, ActivityEntity | null>()

  for (const ref of input.refs) {
    const entity = entityOf(ref)

    if (entity != null) {
      entities.set(activityEntityKey(ref), entity)
    } else if (answered(ref)) {
      entities.set(activityEntityKey(ref), null)
    }
  }

  return entities
}

/**
 * One stored approach path as coordinates, or nothing when it does not decode.
 *
 * `geoPaths` holds whatever was written to it, and a card that draws a map is not the place
 * to find out that one entry is malformed: the throw would take the whole feed with it.
 */
function decodeApproach(encoded: string): Coords[][] {
  try {
    return [decodePath(encoded).map(([lat, long]) => ({ lat, long }))]
  } catch {
    return []
  }
}

/** Rows by their id as text, which is how an activity stores it. */
function index<T extends { id: number }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [String(row.id), row]))
}
