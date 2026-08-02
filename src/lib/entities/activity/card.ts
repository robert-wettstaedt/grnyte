import type { AscentType } from '$lib/entities/ascent/dto'
import type { MediaFile } from '$lib/entities/file/dto'
import { hasMessage, type MessageKey } from '$lib/i18n/message'
import type { ActivityListItem } from './dto'
import {
  activityEntityKey,
  activityEntityRefs,
  type ActivityEntity,
  type ActivityEntityMap,
  type ActivityEntityRef,
} from './entity'
import { activityField, type ActivityField } from './fields'
import type { ActivityGroup } from './grouping'

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
  /**
   * The key to render: the first of {@link keys} paraglide actually has, or the least
   * specific one, which then renders as itself and so fails loudly rather than blankly.
   */
  key: MessageKey
  /**
   * Candidates, most specific first. Exposed rather than hidden because the fallback is
   * a correctness rule, not an implementation detail: a column-scoped delete must never
   * degrade to the whole-entity verb, and that is only assertable on the chain.
   *
   * Plain strings: a candidate is a guess until {@link hasMessage} confirms it.
   */
  keys: string[]
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
  const placeName = entityOf(parentRef(group.activities))?.name

  const entityName =
    // An upload names what it was attached to, never the file: a file's own name is a cuid.
    // This holds for a lone photo as much as for five, so it is decided before `single`.
    newest.entityType === 'file'
      ? (placeName ?? entityOf(refs[0])?.name)
      : group.kind === 'single'
        ? headlineEntityName(newest, entityOf(refs[0]))
        : (placeName ?? entityOf(refs[0])?.name ?? headlineEntityName(newest, undefined))

  // Whose ascent the card is about. A region maintainer may edit anyone's, so "an ascent"
  // would leave the reader guessing. Unknown counts as somebody else's: claiming it was
  // their own would be a lie, while an unresolved name renders as the same placeholder
  // every other slot uses.
  const climber = entityOf(refs[0])
  const owner = climber?.climberFk != null && climber.climberFk === newest.userFk ? 'self' : 'other'
  const mine = currentUserFk != null && group.userFk === currentUserFk

  const keys = group.kind === 'single' ? verbKeys(newest) : [groupVerbKey(group)]

  return {
    actorName: newest.userName,
    changes: group.activities.flatMap((activity) => {
      const field = activityField(activity.columnName)
      return field == null ? [] : [{ activity, field }]
    }),
    climberName: climber?.climberName,
    createdAt: group.createdAt,
    entityName,
    files: refs.flatMap((ref) => entityOf(ref)?.files ?? []),
    headline: {
      // The cast is the one place a key escapes checking, and deliberately: a chain that
      // matched nothing renders as its own last candidate, which is the loud failure.
      key: keys.find(hasMessage) ?? (keys[keys.length - 1] as MessageKey),
      keys,
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
    // A new ascent stores its ascent type in `newValue`; no other row has a status glyph.
    status:
      newest.entityType === 'ascent' && newest.type === 'created'
        ? (newest.newValue as AscentType | undefined)
        : undefined,
    summary: summaryParts(group, placeName),
  }
}

/** The activity in `activities` that points at `ref`, which is where its name is stashed. */
function activityFor(activities: readonly ActivityListItem[], ref: ActivityEntityRef): ActivityListItem {
  return (
    activities.find((activity) => activity.entityId === ref.id && activity.entityType === ref.type) ?? activities[0]
  )
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
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
  // An invitation names the invitee, who has no user row yet: `regions.remote.ts` stores
  // their address in the value column and points `entityId` at the *inviter*. Hydrating
  // that would render "Jonas invited Jonas", so the stored address wins here.
  if (activity.columnName === 'invitation') {
    return activity.newValue ?? activity.oldValue
  }

  if (entity != null) {
    return entity.name
  }

  // An ascent's value columns hold its ascent type, never a name.
  if (activity.entityType === 'ascent') {
    return undefined
  }

  if (activity.columnName == null) {
    return activity.type === 'deleted' ? activity.oldValue : activity.newValue
  }

  // Every other column stores its own value (a grade id, a rating), which would read as a
  // nonsense name. Only the naming columns, and the `user` rows whose value *is* the person
  // (an email, a role target), are safe to borrow from.
  return activity.columnName === 'name' || activity.columnName === 'username' || activity.entityType === 'user'
    ? (activity.newValue ?? activity.oldValue)
    : undefined
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
  const parts: ActivityMessagePart[] = [
    group.kind === 'session'
      ? { key: 'activity_summaryAscents', params: { count } }
      : group.kind === 'upload'
        ? { key: 'activity_summaryFiles', params: { count } }
        : { key: 'activity_summaryEdits', params: { count } },
  ]

  // The edits headline already names the place; a session's does not.
  if (group.kind === 'session' && placeName != null) {
    parts.push({ text: placeName })
  }

  const actors = new Set(group.activities.map((activity) => activity.userFk)).size
  if (actors > 1) {
    parts.push({ key: 'activity_summaryPeople', params: { count: actors } })
  }

  return parts
}

/** `parking location` -> `parkingLocation`; every other column name is already camel case. */
function toCamelCase(value: string): string {
  return value.replace(/[\s_-](\w)/g, (_, char: string) => char.toUpperCase())
}

/**
 * Verb keys from most to least specific: the entity, its change type and the column that
 * changed, falling back to the column-less verb. So `activity_routeUpdatedGradeFk` degrades
 * to `activity_routeUpdated` rather than needing all 30 combinations spelled out.
 *
 * `deleted` gets no such fallback: there the column-less verb says the entity itself is
 * gone, so degrading a removed photo to `activity_routeDeleted` would claim a live route
 * was deleted. A missing key renders as the key, the louder failure of the two.
 */
function verbKeys(activity: ActivityListItem): string[] {
  const base = `activity_${activity.entityType}${capitalize(activity.type)}`

  // `ascent` created rows carry the ascent type in `newValue` rather than a column name.
  const suffix =
    activity.entityType === 'ascent' && activity.type === 'created' ? activity.newValue : activity.columnName

  if (suffix == null || suffix.length === 0) {
    return [base]
  }

  const specific = `${base}${capitalize(toCamelCase(suffix))}`
  return activity.type === 'deleted' ? [specific] : [specific, base]
}
