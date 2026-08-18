import { entityHref } from '$lib/components/EntitySearch/search.svelte'
import { blockName } from '$lib/entities/block/mapper'
import type { EventEntity } from '$lib/entities/event/entity'
import { fileParent, toMediaFile } from '$lib/entities/file/mapper'
import { toGeolocation } from '$lib/entities/geolocation/mapper'
import type { CommentListItem, ReactionListItem } from '$lib/entities/reaction/dto'
import { toComment, toReaction } from '$lib/entities/reaction/mapper'
import type { RegionMembership } from '$lib/entities/region/dto'
import { regionCrumb } from '$lib/entities/region/mapper'
import { toRouteListItem, type RouteListRow } from '$lib/entities/route/mapper'
import { decodeApproach } from '$lib/map/polyline'
import type { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import { objectOf, type EventObjectType } from './dto'

export interface EventChangeItem {
  columnName: string
  newValue: string | undefined
  /** Set only when one call moved several rows; null means the event's own object. */
  objectId: number | string | undefined
  objectType: EventObjectType | undefined
  oldValue: string | undefined
}

/**
 * One event, ready to render.
 *
 * The shape `CatalogueRow` had, minus everything that existed to work around the polymorphic
 * pair: no `entityId`/`entityType` to look up, no `parentEntity*` to stand in for a join, and no
 * separate hydration result to marry to it. The entity is `entity`, resolved here, because the row
 * already carried it.
 */
export interface EventListItem {
  actorFk: number
  /** The actor's username; empty while the user row has not synced. */
  actorName: string
  changes: EventChangeItem[]
  /** What people said under this event, oldest first. Never a reply: those do not sync here. */
  comments: Omit<CommentListItem, 'mine'>[]
  createdAt: number
  /**
   * What the event is about, already resolved.
   *
   * Never a skeleton and never a tombstone, which is the tri-state the old hydration pass carried.
   * The object arrives with the event in one snapshot, so "not synced yet" cannot happen; and every
   * entity that can be deleted soft-deletes, so a removed one still answers with its own name.
   * `undefined` means only that the row is one of the few whose object contributes no entity (a
   * file, which has no page of its own).
   */
  entity: EventEntity | undefined
  id: number
  /** Free-form string the writer attached: a role, an invited address, a topo change. */
  metadata: string | undefined
  objectId: number | string
  objectType: EventObjectType
  /**
   * The closest thing to "same place" the event knows, which is what a burst card groups on.
   *
   * Not a stored column any more. `parent_entity_type`/`parent_entity_id` existed because a
   * polymorphic ref cannot be traversed; here it is read off the object's own foreign key, so it
   * cannot disagree with the row it describes.
   */
  parent: undefined | { id: number | string; type: EventObjectType }
  /**
   * The parent, resolved, for the headline that names it.
   *
   * "Made 12 edits in Nordblock" names the block, and none of those twelve events is about it:
   * the old hydration pass fetched parents for exactly this reason. Read off the relation the row
   * already carried, so it costs no query. Thinner than {@link entity} on purpose, since nothing
   * renders it as a row; only the headline and the session summary read its name.
   *
   * Absent for a file, whose entity IS its parent's (the card keys that one under both).
   */
  parentEntity: EventEntity | undefined
  /** The emoji sent on THIS event. A card shows one bar per event, not one per card. */
  reactions: ReactionListItem[]
  regionFk: number
  verb: EventVerb
}

export type EventRow = QueryRow<typeof queries.listEvents>

export type EventVerb = EventRow['verb']

/** A synced row as the feed renders it. */
export function toEvent(row: EventRow, userRegions: RegionMembership[]): EventListItem {
  const object = objectOf(row)

  return {
    actorFk: row.actorFk,
    actorName: row.actor?.username ?? '',
    changes: (row.changes ?? []).map(toEventChange),
    comments: (row.reactions ?? []).filter((reaction) => reaction.type === 'comment').map(toComment),
    createdAt: row.createdAt ?? 0,
    entity: entityOf(row, userRegions),
    id: row.id,
    metadata: row.metadata ?? undefined,
    // The CHECK makes the fallback unreachable; it exists so the mapper is total rather than
    // throwing on a row a future migration could add a seventh column to.
    objectId: object?.id ?? 0,
    objectType: object?.type ?? 'area',
    parent: parentOf(row),
    parentEntity: parentEntityOf(row, userRegions),
    reactions: (row.reactions ?? []).filter((reaction) => reaction.type === 'emoji').map(toReaction),
    regionFk: row.regionFk,
    verb: row.verb,
  }
}

/**
 * The entity a card renders, built from the relation the row already carried.
 *
 * This is `KINDS[type].toEntity` from the hydration pass, with everything that made it hard gone:
 * no `tables` argument (an ascent reads `ascent.route` directly rather than another kind's index),
 * no `ready` set and no `needs` graph, because there is no second wave to wait for.
 */
/** The six object slots, all empty: the base for asking `entityOf` about a file's parent. */
const EMPTY_OBJECTS = {
  area: undefined,
  ascent: undefined,
  block: undefined,
  file: undefined,
  route: undefined,
  subject: undefined,
}

/**
 * What the object hangs off, read through its own foreign key.
 *
 * A file is the awkward one: it has four possible parents and names whichever it landed on, which
 * is why an upload card says "added 5 photos to Rampe". That precedence is `fileParent`, shared
 * with the write path so the event's object and the feed's grouping key cannot disagree.
 */
/**
 * The one hop up from an event's object: an area's parent, a block's area, a route's block, an
 * ascent's route, and whatever a file landed on.
 *
 * Exported because the push digest asks the same question of the same rows and used to answer it
 * in raw SQL, a `coalesce` and a `case` that had to be kept in step with this by hand. The digest
 * groups a burst on what it gets back, so the two drifting means a push that groups differently
 * from the feed it is summarising.
 */
export function eventParentRef(fks: {
  areaParentFk: null | number | undefined
  ascentRouteFk: null | number | undefined
  blockAreaFk: null | number | undefined
  file: null | Parameters<typeof fileParent>[0] | undefined
  routeBlockFk: null | number | undefined
}): undefined | { id: number | string; type: EventObjectType } {
  if (fks.areaParentFk != null) return { id: fks.areaParentFk, type: 'area' }
  if (fks.blockAreaFk != null) return { id: fks.blockAreaFk, type: 'area' }
  if (fks.routeBlockFk != null) return { id: fks.routeBlockFk, type: 'block' }
  if (fks.ascentRouteFk != null) return { id: fks.ascentRouteFk, type: 'route' }
  if (fks.file != null) return fileParent(fks.file)

  // A user has none: a person's region membership is not a place.
  return undefined
}

/**
 * The entity a row renders, built from the object relation it already carried.
 *
 * Structural rather than typed on `EventRow`, because the inbox nests the same six relations on
 * `notifications` and has to draw the same row from them. A notification carries no verb, which
 * only reaches the invitation branch below: those two source types name their subject in the
 * sentence and never draw a row at all.
 */
export function toEventEntity(
  row: Pick<EventRow, 'area' | 'ascent' | 'block' | 'file' | 'route' | 'subject'> & {
    metadata?: null | string
    verb?: EventRow['verb']
  },
  userRegions: RegionMembership[],
): EventEntity | undefined {
  return entityOf(row as EventRow, userRegions)
}

function entityOf(row: EventRow, userRegions: RegionMembership[]): EventEntity | undefined {
  const crumbs = (regionFk: null | number | undefined, rest: (null | string | undefined)[]) =>
    [regionCrumb(userRegions, regionFk), ...rest].filter((crumb): crumb is string => crumb != null)

  if (row.area != null) {
    const area = row.area
    return {
      crumbs: crumbs(area.regionFk, [area.parent?.name]),
      description: area.description ?? undefined,
      href: entityHref({ id: area.id, label: area.name, type: 'areas' }),
      name: area.name,
      paths: (area.geoPaths ?? []).flatMap(decodeApproach),
      row: 'area',
    }
  }

  if (row.block != null) {
    const block = row.block
    // Through `blockName`, not `block.name`: blocks are routinely nameless and the fallback is
    // what makes a card say "Block 3" instead of nothing. Exported precisely so the screen and the
    // push digest cannot disagree, and the same trap `routeEntity` documents further down.
    const name = blockName(block.name, block.order)
    return {
      crumbs: crumbs(block.regionFk, [block.area?.name]),
      href: entityHref({ id: block.id, label: name, type: 'blocks' }),
      name,
      pin: block.geolocation == null ? undefined : toGeolocation(block.geolocation),
      row: 'block',
      // The first topo that HAS a file, not the first topo: indexing before filtering renders a
      // block flat whenever its leading topo lost its image, even though a later one has it.
      topoImagePath: (block.topos ?? []).find((topo) => topo.file != null)?.file?.path,
    }
  }

  if (row.route != null) {
    return routeEntity(row.route, userRegions)
  }

  if (row.ascent != null) {
    const ascent = row.ascent
    // The ROUTE carries the row (grade, stars, tags, topo thumb); reading those off the ascent
    // would render a real route with zeroed values. It arrives nested now, so the case the old
    // code guarded with `needs: ['route']` cannot happen: either the ascent is here with its
    // route, or the ascent is not here at all.
    return {
      ...(ascent.route == null ? { name: '', row: 'none' as const } : routeEntity(ascent.route, userRegions)),
      ascentGradeFk: ascent.gradeFk ?? undefined,
      ascentRating: ascent.rating ?? undefined,
      ascentType: ascent.type,
      climbedAt: ascent.dateTime == null ? undefined : new Date(ascent.dateTime).getTime(),
      climberFk: ascent.createdBy,
      climberName: ascent.author?.username,
      // `ascentCreatedBy` stamped back on, exactly as `ascent/mapper.ts` does. `toMediaFile`
      // hard-codes it undefined on purpose, and it is the sole discriminator in
      // `file/permissions.ts`: without it an ascent clip falls through to the EDIT branch, so a
      // maintainer who is not the climber could publish or delete somebody else's media.
      files: (ascent.files ?? []).map((file) => ({ ...toMediaFile(file), ascentCreatedBy: ascent.createdBy })),
      humidity: ascent.humidity ?? undefined,
      note: ascent.notes ?? undefined,
      temperature: ascent.temperature ?? undefined,
    }
  }

  if (row.subject != null) {
    const subject = row.subject

    // An invitation names an address, and the invitee has no account: `subject_fk` holds the
    // INVITER, degenerately, and the address is in `metadata`. Rendering the subject here would
    // put the inviter's own name and profile link under "Jonas invited mara@example.com".
    // Both halves of the invitation pair. `invite` and the revoke both point `subject_fk` at the
    // INVITER, degenerately, with the address in `metadata`; rendering the subject would say
    // "Jonas removed Jonas". `metadata != null` is what the region code itself uses to tell a
    // revoked invitation from a removed member, which share the `remove` verb.
    if (row.verb === 'invite' || (row.verb === 'remove' && row.metadata != null)) {
      return { crumbs: [], name: row.metadata ?? '', row: 'none' }
    }

    return {
      // No breadcrumb: a person's region membership would read like a location path.
      crumbs: [],
      // No link once they are out of the region: their profile is a dead end for a reader whose
      // member list no longer holds them, and the row would sit there pulsing.
      ...(row.verb === 'remove' || row.verb === 'leave'
        ? { row: 'none' as const }
        : { href: entityHref({ id: subject.id, label: subject.username, type: 'users' }), row: 'user' as const }),
      name: subject.username,
    }
  }

  // A file has no page of its own and its id is a cuid, so it contributes the photo and nothing
  // else: the card names the parent it landed on, which the file row itself points at.
  if (row.file != null) {
    const raw = row.file
    const media = toMediaFile(raw)
    // A file hanging off an ascent is ascent media wherever it is read from, and `ascentCreatedBy`
    // is the only discriminator `file/permissions.ts` has.
    const owner = raw.ascent?.createdBy
    const files = [owner == null ? media : { ...media, ascentCreatedBy: owner }]

    // A file has no page and no name of its own, so the card BORROWS the entity it landed on: that
    // is where "added 5 photos to Rampe" gets "Rampe", and it is the row drawn beneath the photos.
    // The old catalogue spelled this as `names: 'parent'` and hydrated the parent for the same
    // reason. Without it an upload card can name nothing and render no row at all.
    const parent =
      raw.route != null
        ? routeEntity(raw.route, userRegions)
        : entityOf({ ...EMPTY_OBJECTS, area: raw.area, ascent: raw.ascent, block: raw.block } as EventRow, userRegions)

    return parent == null ? { files, name: '', row: 'none' } : { ...parent, files }
  }

  return undefined
}

/**
 * The parent as an entity, for the one slot that names it: a burst headline, a session summary.
 *
 * Deliberately built from the relation the object already carries rather than by asking for the
 * parent row itself. That keeps it free, and it is enough: a name and a link is all a headline
 * puts in its slot.
 */
function parentEntityOf(row: EventRow, userRegions: RegionMembership[]): EventEntity | undefined {
  const areaEntity = (area: { id: number; name: string }): EventEntity => ({
    crumbs: [],
    href: entityHref({ id: area.id, label: area.name, type: 'areas' }),
    name: area.name,
    row: 'area',
  })

  if (row.area?.parent != null) {
    return areaEntity(row.area.parent)
  }

  if (row.block?.area != null) {
    return areaEntity(row.block.area)
  }

  if (row.route?.block != null) {
    const block = row.route.block
    // `blockName`, not `block.name`: blocks are routinely nameless, and a headline naming the
    // empty string reads as a missing name rather than as "Block 3".
    const name = blockName(block.name, block.order)
    return { crumbs: [], href: entityHref({ id: block.id, label: name, type: 'blocks' }), name, row: 'block' }
  }

  if (row.ascent?.route != null) {
    return routeEntity(row.ascent.route, userRegions)
  }

  // A file's own entity is already its parent's, and a user has no parent: a person's region
  // membership is not a place.
  return undefined
}

function parentOf(row: EventRow): undefined | { id: number | string; type: EventObjectType } {
  return eventParentRef({
    areaParentFk: row.area?.parentFk,
    ascentRouteFk: row.ascent?.routeFk,
    blockAreaFk: row.block?.areaFk,
    file: row.file,
    routeBlockFk: row.route?.blockFk,
  })
}

function routeEntity(route: NonNullable<EventRow['route']>, userRegions: RegionMembership[]): EventEntity {
  // The relation syncs the same tree `listRoutes` does (tags, first ascents, block/area, topo),
  // so this is the same row by structure. The two query types are nominally distinct because they
  // are built from different roots, which is the only reason this needs saying.
  const item = toRouteListItem(route as unknown as RouteListRow)
  // Read off the MAPPED item, not the raw row: `toRouteListItem` swaps an empty name for the
  // "unnamed" fallback and an empty block name for `Block N`, and it exists so nothing downstream
  // ever sees the empty string. Reading `route.name` here put it straight back.
  return {
    crumbs: [regionCrumb(userRegions, route.regionFk), route.block?.area?.name, item.blockName].filter(
      (crumb): crumb is string => crumb != null && crumb.length > 0,
    ),
    href: entityHref({ id: route.id, label: item.name, type: 'routes' }),
    name: item.name,
    route: item,
    row: 'route',
  }
}

function toEventChange(change: NonNullable<EventRow['changes']>[number]): EventChangeItem {
  const object = objectOf(change)

  return {
    columnName: change.columnName,
    newValue: change.newValue ?? undefined,
    objectId: object?.id,
    objectType: object?.type,
    oldValue: change.oldValue ?? undefined,
  }
}
