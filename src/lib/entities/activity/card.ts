import type { AscentType } from '$lib/entities/ascent/dto'
import type { MediaFile } from '$lib/entities/file/dto'
import type { MessageKey } from '$lib/i18n/message'
import type { ActivityListItem } from './dto'
import {
  activityEntityKey,
  activityEntityRefs,
  type ActivityEntity,
  type ActivityEntityMap,
  type ActivityEntityRef,
} from './entity'
import type { ActivityGroup } from './grouping'
import { activityEntry, activityVerb, type ActivityField } from './verbs'

/** A card never lists more than a handful of rows; the rest collapse into a count. */
const MAX_ROWS = 4

/**
 * One entity row on a card, and which of the three shapes it takes. `skeleton` means the
 * entity has not synced yet, `tombstone` that hydration finished without it, so it is gone.
 */
export interface ActivityCardRow {
  entity: ActivityEntity | undefined
  /** The name to show on a tombstone, taken off the row that named the entity. */
  name: string | undefined
  ref: ActivityEntityRef
  state: 'entity' | 'skeleton' | 'tombstone'
}

/**
 * Everything a card says, decided before any markup touches it.
 *
 * Message keys and their params come out of here, never resolved copy: a test can then
 * assert that a removed photo picks `activity_routeDeletedFile` without asserting on the
 * English or German sentence that key happens to hold this week. What stays in the
 * component is what genuinely cannot leave it: the relative clock, the grade labels that
 * need `globalState`, and the expand toggle.
 */
export interface ActivityCardView {
  /** The actor's username. Empty while the user row has not synced. */
  actorName: string
  changes: ActivityChange[]
  /** Whose ascent the card is about, when that is somebody other than the actor. */
  climberName: string | undefined
  createdAt: number
  /** The entity the headline names, which a group borrows from its shared parent. */
  entityName: string | undefined
  /**
   * Whether {@link entityName} is missing for good rather than still syncing: everything it
   * could come from has answered, and none of it held a name. Without this the headline
   * pulses as a skeleton forever for an entity that was deleted without its name ever being
   * stored, or one that was added without a name at all.
   */
  entityUnnamed: boolean
  files: MediaFile[]
  headline: ActivityHeadline
  /** `{#each}` key. Carried through from the group so a card keeps its expand state. */
  id: string
  /** Whether the signed-in user is the actor, which makes the card read "You ...". */
  mine: boolean
  note: string | undefined
  /** Rows beyond {@link MAX_ROWS}, reported as a count instead of rendered. */
  overflowCount: number
  rows: ActivityCardRow[]
  /** The ascent's type, when the card is about a new ascent. Drives the status glyph. */
  status: AscentType | undefined
  summary: ActivityMessagePart[] | undefined
}

/** One changed column the expanded half renders, paired with its registry entry. */
export interface ActivityChange {
  activity: ActivityListItem
  field: ActivityField
}

export interface ActivityHeadline {
  /** The sentence to render, straight out of the verb catalogue. */
  key: MessageKey
  params: { owner: 'other' | 'self'; person: 'other' | 'self' }
}

/** A piece of a composed line: a message to resolve, or text that is already a name. */
export type ActivityMessagePart =
  | { key: MessageKey; params?: Record<string, unknown>; text?: never }
  | { key?: never; text: string }

/**
 * Fold a group into what its card renders.
 *
 * `entities` is the hydration result: a key it does not hold is still syncing, an explicit
 * `null` means hydration finished without it. Both render, differently.
 */
export function activityCard(
  group: ActivityGroup,
  entities: ActivityEntityMap | undefined,
  currentUserFk: number | undefined,
): ActivityCardView {
  const newest = group.activities[0]
  const refs = activityEntityRefs(group.activities)
  const entityOf = (ref: ActivityEntityRef | undefined) =>
    ref == null ? undefined : entities?.get(activityEntityKey(ref))

  // The place a burst happened in, when its rows agree on one. Its own row is not rendered
  // (the edits below it are), only its name, in the headline and the session summary.
  const place = parentRef(group.activities)
  const placeName = named(entityOf(place)?.name)
  const firstName = named(entityOf(refs[0])?.name)

  const entityName =
    // An upload names what it was attached to, never the file: a file's own name is a cuid.
    // This holds for a lone photo as much as for five, so it is decided before `single`.
    activityEntry(newest)?.names === 'parent'
      ? (placeName ?? firstName)
      : group.kind === 'single'
        ? headlineEntityName(newest, entityOf(refs[0]))
        : (placeName ?? firstName ?? headlineEntityName(newest, undefined))

  // A missing name is only worth waiting for while something might still answer. Once every
  // ref it could come from has answered (with a row that has no name, or with nothing at
  // all), no name is coming and the slot has to say so rather than pulse.
  const nameRefs = [place, refs[0]].filter((ref): ref is ActivityEntityRef => ref != null)
  const entityUnnamed =
    entityName == null && nameRefs.length > 0 && nameRefs.every((ref) => entityOf(ref) !== undefined)

  // Whose ascent the card is about. A region maintainer may edit anyone's, so "an ascent"
  // would leave the reader guessing. Unknown counts as somebody else's: claiming it was
  // their own would be a lie, while an unresolved name renders as the same placeholder
  // every other slot uses.
  const climber = entityOf(refs[0])
  const owner = climber?.climberFk != null && climber.climberFk === newest.userFk ? 'self' : 'other'
  const mine = currentUserFk != null && group.userFk === currentUserFk

  return {
    actorName: newest.userName,
    changes: group.activities.flatMap((activity) => {
      const field = activityEntry(activity)?.field
      return field == null ? [] : [{ activity, field }]
    }),
    climberName: climber?.climberName,
    createdAt: group.createdAt,
    entityName,
    entityUnnamed,
    files: refs.flatMap((ref) => entityOf(ref)?.files ?? []),
    headline: {
      key: group.kind === 'single' ? activityVerb(newest) : groupVerbKey(group),
      params: { owner, person: mine ? 'self' : 'other' },
    },
    id: group.id,
    mine,
    note: refs.map((ref) => entityOf(ref)?.note).find((value) => value != null && value.length > 0),
    overflowCount: Math.max(0, refs.length - MAX_ROWS),
    rows: refs.slice(0, MAX_ROWS).map((ref): ActivityCardRow => {
      const entity = entityOf(ref)
      return {
        entity: entity ?? undefined,
        // The row that named this entity, not the group's newest: a burst spanning two
        // deleted routes must not label both tombstones with the same name.
        name: headlineEntityName(activityFor(group.activities, ref), null),
        ref,
        state: entity === undefined ? 'skeleton' : entity === null ? 'tombstone' : 'entity',
      }
    }),
    // Declared on the entry, so the cast is reachable only for the four rows that really do
    // store an ascent type in `newValue`.
    status: activityEntry(newest)?.status === 'ascentType' ? (newest.newValue as AscentType | undefined) : undefined,
    summary: summaryParts(group, placeName),
  }
}

/** The activity in `activities` that points at `ref`, which is where its name is stashed. */
function activityFor(activities: readonly ActivityListItem[], ref: ActivityEntityRef): ActivityListItem {
  return (
    activities.find((activity) => activity.entityId === ref.id && activity.entityType === ref.type) ?? activities[0]
  )
}

/**
 * The headline key for a whole card. A single-activity card speaks its own verb; a grouped
 * one summarises, because "redpointed Rampe" would name one of four ascents. The count
 * lives in the summary, so these stay one sentence per key.
 */
function groupVerbKey(group: ActivityGroup): MessageKey {
  if (group.kind === 'session') {
    return 'activity_groupSession'
  }

  if (group.kind === 'upload') {
    return 'activity_groupUploads'
  }

  // No `{name}`: what a removal card would name is exactly what it just deleted, so the slot
  // would be the "<no name>" placeholder on every card that did not stash a name.
  if (group.kind === 'removal') {
    return 'activity_groupRemovals'
  }

  // Only `entity` groups can mix actors, and then no single person "edited" it.
  const actors = new Set(group.activities.map((activity) => activity.userFk))
  return actors.size > 1 ? 'activity_groupEditsMultiple' : 'activity_groupEdits'
}

/**
 * The name to put in a headline. The hydrated entity's when it is there, otherwise the one
 * the row itself stashed: a create row carries the added name in `newValue`, a delete row
 * the removed one in `oldValue`.
 */
function headlineEntityName(activity: ActivityListItem, entity: ActivityEntity | null | undefined): string | undefined {
  const entry = activityEntry(activity)

  // A stored subject is never the hydrated one: an invitation names an address the invitee
  // has no account for, and points `entityId` at the inviter, so hydrating it would render
  // "Jonas invited Jonas".
  if (entry?.names === 'stored') {
    return named(activity.newValue ?? activity.oldValue)
  }

  if (entity != null) {
    return named(entity.name)
  }

  // Nothing hydrated, so fall back to the value column the entry says carries the name. An
  // entry with no `tombstone` has none: every other column stores its own value (a grade id,
  // a rating, an ascent type), which would read as a nonsense name.
  return entry?.tombstone == null ? undefined : named(activity[entry.tombstone])
}

/**
 * A name that is actually one. A name column holds `''` as readily as `null` (a route added
 * without a name stores an empty `newValue`), and an empty string reaches the screen as a
 * blank slot rather than falling through to the next candidate or to a tombstone label.
 */
function named(value: null | string | undefined): string | undefined {
  return value == null || value.length === 0 ? undefined : value
}

/**
 * The place a group of edits happened in, when every row agrees on one parent. That is what
 * a burst headline names ("made 12 edits in Nordblock"); a group spanning two parents has
 * no such place and falls back to its first entity.
 */
function parentRef(activities: readonly ActivityListItem[]): ActivityEntityRef | undefined {
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

/** The sub line under a grouped card's headline. A single card has none. */
function summaryParts(group: ActivityGroup, placeName: string | undefined): ActivityMessagePart[] | undefined {
  if (group.kind === 'single') {
    return undefined
  }

  const count = group.activities.length
  const countKey: MessageKey =
    group.kind === 'session'
      ? 'activity_summaryAscents'
      : group.kind === 'upload'
        ? 'activity_summaryFiles'
        : group.kind === 'removal'
          ? 'activity_summaryRemovals'
          : 'activity_summaryEdits'

  const parts: ActivityMessagePart[] = [{ key: countKey, params: { count } }]

  // The edits headline already names the place; a session's and a removal's do not.
  if ((group.kind === 'session' || group.kind === 'removal') && placeName != null) {
    parts.push({ text: placeName })
  }

  const actors = new Set(group.activities.map((activity) => activity.userFk)).size
  if (actors > 1) {
    parts.push({ key: 'activity_summaryPeople', params: { count: actors } })
  }

  return parts
}
