import type { AscentType } from '$lib/entities/ascent/dto'
import type { MediaFile } from '$lib/entities/file/dto'
import { diffTopoLines, parseTopoChange, type TopoChange, type TopoLineDiff } from '$lib/entities/topo/change'
import type { TopoView } from '$lib/entities/topo/dto'
import type { MessageKey } from '$lib/i18n/message'
import type { ActivityListItem } from './dto'
import {
  activityEntityKey,
  activityEntityRefs,
  activityRowRefs,
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
  /** What a topo row changed, decoded once here so the change list stays markup over a
   *  decided view, like every other renderer. Absent for a row that named no topo change:
   *  every one written before `metadata` existed, which renders as vaguely as it always did. */
  topo?: ActivityTopoChange
}

export interface ActivityHeadline {
  /** The sentence to render, straight out of the verb catalogue. */
  key: MessageKey
  params: { media: ActivityMedia; owner: 'none' | 'other' | 'self'; person: 'other' | 'self' }
}

/**
 * Which word a sentence about media uses. `none` covers three cases that all have to read
 * the same way: nothing has synced yet, the file is gone, and a submit that mixed the two,
 * where neither "photo" nor "video" is true of the card.
 */
export type ActivityMedia = 'none' | 'photo' | 'video'

/** A piece of a composed line: a message to resolve, or text that is already a name. */
export type ActivityMessagePart =
  | { key: MessageKey; params?: Record<string, unknown>; text?: never }
  | { key?: never; text: string }

export interface ActivityTopoChange {
  /** Which of the five topo edits it was, and which photo it happened on. */
  change: TopoChange
  /** What the redraw drew, moved and erased, plus the state it left behind. Empty on the
   *  four photo actions, which carry no before/after pair. */
  lines: TopoLineDiff
  /** The photo itself, when it is still there to draw. */
  view: TopoView | undefined
}

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
  topos?: ReadonlyMap<number, TopoView>,
): ActivityCardView {
  const newest = group.activities[0]
  const refs = activityEntityRefs(group.activities)
  // What the card points AT and what it renders as rows are two different questions. An upload
  // points at a file, which supplies the media and no row; the row belongs to the route or
  // ascent it landed on.
  const rowRefs = activityRowRefs(group.activities)
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
        ? // An entry with no `tombstone` stores no name to fall back on, by design: an ascent's
          // value column holds its ascent type. Once the ascent is gone there is nothing left
          // on the row, and the parent route is the only true name for it. Entries that DO
          // declare a tombstone are left alone, so a route deleted without a name still says
          // so rather than borrowing the block it hung on.
          (headlineEntityName(newest, entityOf(refs[0])) ??
          (activityEntry(newest)?.tombstone == null ? placeName : undefined))
        : // A group whose rows all point at ONE entity is about that entity, so it names it.
          // Falling to the parent here is what made four topo saves on Nordblock read as
          // "edited Steinbruch", the area the block hangs under. The parent is still the right
          // answer for a burst spanning several routes, where no single one is the subject.
          refs.length === 1
          ? (firstName ?? placeName ?? headlineEntityName(newest, undefined))
          : (placeName ?? firstName ?? headlineEntityName(newest, undefined))

  // A missing name is only worth waiting for while something might still answer. Once every
  // ref it could come from has answered (with a row that has no name, or with nothing at
  // all), no name is coming and the slot has to say so rather than pulse.
  const nameRefs = [place, refs[0]].filter((ref): ref is ActivityEntityRef => ref != null)
  const entityUnnamed =
    entityName == null && nameRefs.length > 0 && nameRefs.every((ref) => entityOf(ref) !== undefined)

  // Whose ascent the card is about. A region maintainer may edit anyone's, so "an ascent"
  // would leave the reader guessing. The parent is a candidate as well as the subject: an
  // upload points at the file, so the ascent it landed on is only ever the parent, and
  // without it the card says "added a video to Karma" for something added to an ascent.
  //
  // `none` where no ascent is in play at all, which is what lets one sentence cover both
  // ("added a photo to your ascent of X" / "added a photo to X"). An ascent that has not
  // hydrated is `none` too, and reads as the same somebody-else's wording it always did,
  // since every ascent sentence catches the rest with `owner=*`.
  const climber = [refs[0], place].map(entityOf).find((entity) => entity?.climberFk != null)
  const owner = climber == null ? 'none' : climber.climberFk === newest.userFk ? 'self' : 'other'
  const mine = currentUserFk != null && group.userFk === currentUserFk

  const files = refs.flatMap((ref) => entityOf(ref)?.files ?? [])
  // Photo or video. An upload reads it off the hydrated file rather than the row, which only
  // records that a file was added: reading the row would leave every upload logged before
  // this saying "photo". The word settles when the file syncs, alongside the name beside it.
  // A removal has no file left to read and so carries the word itself (see `deleteFile`).
  const kinds = new Set(files.map((file): ActivityMedia => (file.bunnyStreamFk == null ? 'photo' : 'video')))
  // A removal card reads its word off every row it holds, not just the newest: a submit that
  // pulled a photo and a video is neither, and `none` is the arm that says "media".
  const removed = new Set(
    group.activities
      .filter((activity) => activity.columnName === 'file')
      .map((activity) => storedMedia(activity.oldValue)),
  )
  const media =
    newest.columnName === 'file'
      ? removed.size === 1
        ? [...removed][0]
        : 'none'
      : kinds.size === 1
        ? [...kinds][0]
        : 'none'

  return {
    actorName: newest.userName,
    changes: group.activities.flatMap((activity) => {
      const field = activityEntry(activity)?.field
      if (field == null) {
        return []
      }

      // A removed photo resolves to no view on purpose: the row it points at is gone, and
      // so is the image behind it. The change line says so instead of drawing it.
      const change = parseTopoChange(activity.metadata)
      return [
        {
          activity,
          field,
          topo:
            change == null
              ? undefined
              : {
                  change,
                  lines: diffTopoLines(activity.oldValue, activity.newValue),
                  view: change.topoId == null ? undefined : topos?.get(change.topoId),
                },
        },
      ]
    }),
    climberName: climber?.climberName,
    createdAt: group.createdAt,
    entityName,
    entityUnnamed,
    files,
    headline: {
      key: group.kind === 'single' ? activityVerb(newest) : groupVerbKey(group, refs.length),
      params: { media, owner, person: mine ? 'self' : 'other' },
    },
    id: group.id,
    mine,
    note: refs.map((ref) => entityOf(ref)?.note).find((value) => value != null && value.length > 0),
    overflowCount: Math.max(0, rowRefs.length - MAX_ROWS),
    rows: rowRefs.slice(0, MAX_ROWS).map((ref): ActivityCardRow => {
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
    summary: summaryParts(group, placeName, media),
  }
}

/**
 * The word a removal row stored for the file it removed, or `none` for one written before
 * they did. Exported for the change list, which says the same thing under the headline.
 */
export function storedMedia(value: null | string | undefined): ActivityMedia {
  return value === 'photo' || value === 'video' ? value : 'none'
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
function groupVerbKey(group: ActivityGroup, subjects: number): MessageKey {
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
  if (actors.size > 1) {
    return 'activity_groupEditsMultiple'
  }

  // One person, one entity, one kind of change: the card can say which change instead of
  // falling back to "edited". Four topo saves are about the topo and three photo removals are
  // about the photos, and "edited" is true of both while telling the reader neither.
  //
  // `subjects` is the guard, not a nicety. A row's own sentence puts the entity in `{name}`,
  // and a group spanning two routes has no single entity to put there: it borrows its parent's
  // name, so "renamed" would come out as "You renamed Nordblock" for two renamed routes.
  if (subjects !== 1) {
    return 'activity_groupEdits'
  }

  const [first, ...rest] = group.activities.map((activity) => activityEntry(activity)?.key)
  return first != null && rest.every((key) => key === first) ? first : 'activity_groupEdits'
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
function summaryParts(
  group: ActivityGroup,
  placeName: string | undefined,
  media: ActivityMedia,
): ActivityMessagePart[] | undefined {
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

  // Only the file count says what it counted; the other three count one thing each.
  const parts: ActivityMessagePart[] = [
    { key: countKey, params: group.kind === 'upload' ? { count, media } : { count } },
  ]

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
