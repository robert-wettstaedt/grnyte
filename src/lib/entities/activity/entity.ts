import type { AscentType } from '$lib/entities/ascent/dto'
import type { MediaFile } from '$lib/entities/file/dto'
import type { RouteListItem } from '$lib/entities/route/dto'
import type { ActivityDto, ActivityEntityType } from './dto'

/**
 * One hydrated entity, flattened into exactly what a card renders. Deliberately one
 * flat shape rather than a union per entity kind: the card picks a row component from
 * `row` and every other field is optional, so the feed's hydration pass maps four
 * different list resources into it without four different mappers.
 */
export interface ActivityEntity {
  /** Tick type when the row stands for an ascent, so its route row shows the status glyph. */
  ascentType?: AscentType
  /**
   * Whose ascent it is (`ascents.createdBy`). A region admin may edit anyone's, so the
   * headline has to say whether the actor edited their own or somebody else's; without
   * this it can only say "an ascent", which is what nobody could read.
   */
  climberFk?: number
  /** That climber's username, for the headline slot. */
  climberName?: string
  /** Breadcrumb path for the row, e.g. the parent area and block. */
  crumbs?: string[]
  /** Secondary line for area rows. */
  description?: string
  /** Media the card renders full width above the rows. */
  files?: MediaFile[]
  /** Already-resolved row link. */
  href?: string
  /** Display name; the card's headline interpolates it. */
  name: string
  /** An ascent's notes, quoted under the rows. */
  note?: string
  /** The route the row renders, for `route` rows. */
  route?: ActivityRoute
  /** Which entity row the card renders. `none` renders the name alone. */
  row: 'area' | 'block' | 'none' | 'route' | 'user'
  /** Thumbnail for block rows. */
  topoImagePath?: string
}

/**
 * Hydration result, keyed by {@link activityEntityKey}. A missing key means the entity
 * has not synced yet (the card renders a skeleton); an explicit `null` means hydration
 * finished without it, so it is gone (the card renders a tombstone).
 */
export type ActivityEntityMap = ReadonlyMap<string, ActivityEntity | null>

/** The polymorphic `(entityType, entityId)` pair an activity points at. */
export interface ActivityEntityRef {
  id: string
  type: ActivityEntityType
}

/** The slice of a route an activity card's row renders. A `RouteListItem` satisfies it. */
export type ActivityRoute = Pick<
  RouteListItem,
  'description' | 'gradeFk' | 'name' | 'rating' | 'tags' | 'topoImagePath' | 'topoPoints'
>

export function activityEntityKey(ref: ActivityEntityRef): string {
  return `${ref.type}:${ref.id}`
}

/**
 * The name to put in a headline. The hydrated entity's when it is there, otherwise the
 * one the row itself stashed: a create row carries the added name in `newValue`, a
 * delete row the removed one in `oldValue`.
 */
export function activityEntityName(
  activity: ActivityDto,
  entity: ActivityEntity | null | undefined,
): string | undefined {
  // An invitation names the invitee, who has no user row yet: `regions.remote.ts` stores
  // their address in the value column and points `entityId` at the *inviter*. Hydrating
  // that would render "Jonas invited Jonas", so the stored address wins here.
  if (activity.columnName === 'invitation') {
    return activity.newValue ?? activity.oldValue
  }

  if (entity != null) {
    return entity.name
  }

  // An ascent's value columns hold its tick type, never a name.
  if (activity.entityType === 'ascent') {
    return undefined
  }

  if (activity.columnName == null) {
    return activity.type === 'deleted' ? activity.oldValue : activity.newValue
  }

  // Every other column stores its own value (a grade id, a rating), which would read as
  // a nonsense name. Only the naming columns, and the `user` rows whose value *is* the
  // person (an email, a role target), are safe to borrow from.
  return activity.columnName === 'name' || activity.columnName === 'username' || activity.entityType === 'user'
    ? (activity.newValue ?? activity.oldValue)
    : undefined
}

/** The entities a card has to hydrate, newest first, each listed once. */
export function activityEntityRefs(activities: readonly ActivityDto[]): ActivityEntityRef[] {
  const seen = new Set<string>()

  return activities.reduce<ActivityEntityRef[]>((refs, activity) => {
    const ref = { id: activity.entityId, type: activity.entityType }
    const key = activityEntityKey(ref)

    if (!seen.has(key)) {
      seen.add(key)
      refs.push(ref)
    }

    return refs
  }, [])
}

/**
 * The place a group of edits happened in, when every row agrees on one parent. That is
 * what a burst headline names ("made 12 edits in Nordblock"); a group spanning two
 * parents has no such place and falls back to its first entity.
 */
export function activityParentRef(activities: readonly ActivityDto[]): ActivityEntityRef | undefined {
  const first = activities[0]
  if (first?.parentEntityId == null || first.parentEntityType == null) {
    return undefined
  }

  const shared = activities.every(
    (activity) =>
      activity.parentEntityId === first.parentEntityId && activity.parentEntityType === first.parentEntityType,
  )

  return shared ? { id: first.parentEntityId, type: first.parentEntityType } : undefined
}
