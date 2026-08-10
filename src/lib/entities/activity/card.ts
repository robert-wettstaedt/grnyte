import type { AscentType } from '$lib/entities/ascent/dto'
import type { MediaFile } from '$lib/entities/file/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'
import type { TopoView } from '$lib/entities/topo/dto'
import type { MessageKey } from '$lib/i18n/message'
import { activityChanges, storedMedia, type ActivityChangeView, type ActivityMedia } from './change'
import type { ActivityListItem } from './dto'
import {
  activityEntityKey,
  activityRefs,
  type ActivityEntity,
  type ActivityEntityMap,
  type ActivityEntityRef,
} from './entity'
import type { ActivityGroup } from './grouping'
import { activityEntry, activityVerb, parseDeletedAscent, parseDeletionScale } from './verbs'

/** A card never lists more than a handful of rows; the rest collapse into a count. */
const MAX_ROWS = 4

/**
 * What one ascent was logged with, beyond its type. The route row next to it renders the
 * community grade and the community rating; these are one climber's take, which is why they
 * render as their own labelled strip rather than as a second pair of numbers on the row.
 */
export interface ActivityCardAscent {
  gradeFk: number | undefined
  humidity: number | undefined
  rating: number | undefined
  temperature: number | undefined
}

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
  /** What one logged ascent said about the route, when the card logged exactly one. */
  ascent: ActivityCardAscent | undefined
  /** The expanded half: one decided line per changed column. See `change.ts`. */
  changes: ActivityChangeView[]
  /**
   * When the ascents on this card were climbed, if that is a different calendar day from the
   * one they were logged on. Absent otherwise: same-day logging is the norm, and repeating the
   * clock is noise.
   */
  climbedAt: number | undefined
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
  /** The pin a block was placed with, when this is the card that placed it. */
  pin: Geolocation | undefined
  rows: ActivityCardRow[]
  /** The ascent's type, when the card is about a new ascent. Drives the status glyph. */
  status: AscentType | undefined
  summary: ActivityMessagePart[] | undefined
}

export interface ActivityHeadline {
  /** The sentence to render, straight out of the verb catalogue. */
  key: MessageKey
  params: { media: ActivityMedia; owner: 'none' | 'other' | 'self'; person: 'other' | 'self' }
}

/** A piece of a composed line: a message to resolve, or text that is already a name. */
export type ActivityMessagePart =
  | { key: MessageKey; params?: Record<string, unknown>; text?: never }
  | { key?: never; text: string }

/**
 * What the headline and the sub line both have to know, worked out once.
 *
 * They have to agree: the headline saying "You added the route Kante direkt" and the summary
 * counting "3 edits" underneath it are the same card contradicting itself. Deriving each half
 * separately let a branch added to one drift from the other, and paid for the derivation twice
 * on every card of every sync tick.
 */
interface CardVerb {
  /** Distinct actors. More than one, and nobody in particular "edited" the thing. */
  actors: number
  /** The files on a create-that-picked-up-media, which both halves speak for. */
  media: ActivityListItem[] | undefined
  /** The one verb every row shares, when they share one. */
  shared: MessageKey | undefined
}

/**
 * Fold a group into what its card renders.
 *
 * `entities` is the hydration result: a key it does not hold is still syncing, an explicit
 * `null` means hydration finished without it. Both render, differently.
 *
 * `omit` is the entity whose own page this card is rendered on, whose row would be a link back
 * to where the reader already is. Only the rows drop; the headline still names it, because the
 * sentence is one translated string and German puts the participle after the object.
 */
export function activityCard(
  group: ActivityGroup,
  entities: ActivityEntityMap | undefined,
  currentUserFk: number | undefined,
  topos?: ReadonlyMap<number, TopoView>,
  omit?: ActivityEntityRef,
): ActivityCardView {
  const newest = group.activities[0]
  // What the card points AT, what it renders as rows and the place it happened in are three
  // different questions off one pass. An upload points at a file, which supplies the media and
  // no row; the row belongs to the route or ascent it landed on. The place is not rendered as a
  // row at all (the edits below it are), only named, in the headline and the session summary.
  const { place, rows: allRowRefs, subjects: refs } = activityRefs(group.activities)
  const entityOf = (ref: ActivityEntityRef | undefined) =>
    ref == null ? undefined : entities?.get(activityEntityKey(ref))

  // Dropped here rather than in the component so `overflowCount` counts what is left: a scoped
  // log whose rows were all the scope entity would otherwise read "3 more" under no rows at all.
  const omitKey = omit == null ? undefined : activityEntityKey(omit)
  const rowRefs = omitKey == null ? allRowRefs : allRowRefs.filter((ref) => activityEntityKey(ref) !== omitKey)

  const placeName = named(entityOf(place)?.name)
  const firstName = named(entityOf(refs[0])?.name)

  const entityName = headlineName({
    firstName,
    group,
    newest,
    placeName,
    subject: entityOf(refs[0]),
    subjects: refs.length,
  })

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
  // hydrated yet is `none` too, and reads as the same somebody-else's wording it always did,
  // since every ascent sentence catches the rest with `owner=*`.
  //
  // A DELETED ascent never hydrates, so it falls back to what its own row wrote down. Without
  // that every removal read "removed an ascent of Rampe", the one sentence a card about
  // somebody else's log must not say, and four of the six arms were unreachable.
  const climber = [refs[0], place].map(entityOf).find((entity) => entity?.climberFk != null)
  const recorded = group.activities
    .map((activity) => (activity.entityType === 'ascent' ? parseDeletedAscent(activity.metadata) : undefined))
    .find((entry) => entry != null)
  const climberFk = climber?.climberFk ?? recorded?.climberFk
  const owner = climberFk == null ? 'none' : climberFk === newest.userFk ? 'self' : 'other'
  const mine = currentUserFk != null && group.userFk === currentUserFk

  // Keyed by id: a merged create-plus-media group holds the ascent AND the file it landed on,
  // and the ascent hydrates with that same file hanging off it, so the flat list would carry
  // it twice - once as the ascent's, once as its own row's - and the keyed `{#each}` that
  // draws the thumbnails would see two of one key.
  const files = [...new Map(refs.flatMap((ref) => entityOf(ref)?.files ?? []).map((file) => [file.id, file])).values()]
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

  // What the card adds to a CREATE, which is the one shape that has no change list to put it
  // in: the pin a block was placed with, and the numbers an ascent was logged with. An edit
  // already renders each of these as its own change line, and a card that merely mentions the
  // entity has no business growing a map.
  const created = group.activities.flatMap((activity) =>
    activity.type === 'created' ? [entityOf({ id: activity.entityId, type: activity.entityType })] : [],
  )
  // Only when the card created exactly one thing. Two creates have two sets of numbers and no
  // row to hang either on, and a create-plus-media group is still one create.
  const lone = created.length === 1 ? created[0] : undefined
  const ascent = loggedAscent(lone)
  // A session logs several ascents at once, so the date is the card's only when they agree on
  // one. Whether it is worth saying is a question about calendar days, not elapsed time: see
  // `calendarDay`.
  const climbDates = new Set(created.map((entity) => entity?.climbedAt))
  const climbedAt = climbDates.size === 1 ? [...climbDates][0] : undefined

  // Once, for both halves of the card. See `CardVerb`.
  const actors = new Set(group.activities.map((activity) => activity.userFk)).size
  const verb: CardVerb = {
    actors,
    media: createdWithMedia(group),
    shared: sharedVerbKey(group, refs.length, actors),
  }

  return {
    actorName: newest.userName,
    ascent,
    changes: activityChanges(group.activities, { entities, topos }),
    climbedAt: climbedAt != null && climbedAt !== calendarDay(group.createdAt) ? climbedAt : undefined,
    climberName: climber?.climberName ?? recorded?.climberName,
    createdAt: group.createdAt,
    entityName,
    entityUnnamed,
    files,
    headline: {
      key: group.kind === 'single' ? activityVerb(newest) : groupVerbKey(group, verb),
      params: { media, owner, person: mine ? 'self' : 'other' },
    },
    id: group.id,
    mine,
    note: refs.map((ref) => entityOf(ref)?.note).find((value) => value != null && value.length > 0),
    overflowCount: Math.max(0, rowRefs.length - MAX_ROWS),
    pin: lone?.pin,
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
    summary: summaryParts(group, placeName, media, refs.length, verb),
  }
}

/**
 * The name to put in a headline. The hydrated entity's when it is there, otherwise the one
 * the row itself stashed: a create row carries the added name in `newValue`, a delete row
 * the removed one in `oldValue`.
 */
/**
 * The name a headline puts in its `{name}` slot: the stored one where the entry says the subject
 * is stored, the hydrated one where there is one, and the tombstone the row wrote down otherwise.
 *
 * Exported because the push digest renders the same sentences from the same catalogue and must
 * resolve the name the same way. A deleted area's name only exists in `oldValue`, and an
 * invitation deliberately has no hydrated subject at all, so a digest that consulted the database
 * alone would announce both as "<no name>".
 */
export function headlineEntityName(
  activity: ActivityListItem,
  entity: ActivityEntity | null | undefined,
): string | undefined {
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

/** The activity in `activities` that points at `ref`, which is where its name is stashed. */
function activityFor(activities: readonly ActivityListItem[], ref: ActivityEntityRef): ActivityListItem {
  return (
    activities.find((activity) => activity.entityId === ref.id && activity.entityType === ref.type) ?? activities[0]
  )
}

/**
 * The calendar day a moment falls on, as a UTC-midnight stamp, read in the reader's timezone.
 *
 * The stored climb date is a calendar date and arrives as UTC midnight; `createdAt` is a
 * moment. Comparing them as a distance in milliseconds answers a different question and gets
 * it wrong on both sides of UTC: an afternoon log in Hawaii sits more than a day past its own
 * climb date, and a genuine one-day back-date in New Zealand sits less than one from a later
 * one. Both are calendar dates to the reader, so both are compared as such.
 */
function calendarDay(at: number): number {
  const date = new Date(at)
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * The file rows on a group whose leading row created the thing they landed on, or `undefined`
 * when that is not what the group is. `mergeCreatedWithMedia` builds these; both the headline
 * and the summary have to recognise one, so the test lives in one place.
 */
function createdWithMedia(group: ActivityGroup): ActivityListItem[] | undefined {
  if (group.activities[0]?.type !== 'created') {
    return undefined
  }

  const files = group.activities.filter((activity) => activity.entityType === 'file')
  return files.length > 0 ? files : undefined
}

/**
 * "12 blocks, 200 routes" under a deletion, summed over every row on the card.
 *
 * `undefined` when nothing on the card recorded a scale, which covers every deletion logged
 * before the writers started counting as well as every card that is not a deletion.
 */
function deletionScaleParts(group: ActivityGroup): ActivityMessagePart[] | undefined {
  const totals = { areas: 0, blocks: 0, routes: 0 }

  for (const activity of group.activities) {
    const scale = activity.type === 'deleted' ? parseDeletionScale(activity.metadata) : undefined
    totals.areas += scale?.areas ?? 0
    totals.blocks += scale?.blocks ?? 0
    totals.routes += scale?.routes ?? 0
  }

  // No separate "nothing was recorded" flag: `stringifyDeletionScale` only ever writes counts
  // above zero, so a card with no scale on it and a card whose scale is all zeroes are the same
  // card, and the empty list below is what both of them mean.
  const parts: ActivityMessagePart[] = [
    ...(totals.areas > 0 ? [{ key: 'activity_summaryAreas' as const, params: { count: totals.areas } }] : []),
    ...(totals.blocks > 0 ? [{ key: 'activity_summaryBlocks' as const, params: { count: totals.blocks } }] : []),
    ...(totals.routes > 0 ? [{ key: 'activity_summaryRoutes' as const, params: { count: totals.routes } }] : []),
  ]

  return parts.length === 0 ? undefined : parts
}

/**
 * The headline key for a whole card. A single-activity card speaks its own verb; a grouped
 * one summarises, because "redpointed Rampe" would name one of four ascents. The count
 * lives in the summary, so these stay one sentence per key.
 */
function groupVerbKey(group: ActivityGroup, verb: CardVerb): MessageKey {
  // Ahead of every kind rule: a create that picked up media is one event with one sentence,
  // "You flashed Rampe" or "You added the route Kante direkt", the photos below it.
  // `mergeCreatedWithMedia` put the create first for exactly this. Deciding by kind instead
  // would answer "session" for the ascent and "edits" for the route, neither of which is what
  // the reader just did.
  if (verb.media != null) {
    return activityVerb(group.activities[0])
  }

  if (verb.shared != null) {
    return verb.shared
  }

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
  return verb.actors > 1 ? 'activity_groupEditsMultiple' : 'activity_groupEdits'
}

/**
 * The name a card's headline puts in `{name}`, in the order the four rules apply.
 *
 * Early returns rather than one expression: the rules do not compose, they override each other,
 * and the nested ternary this replaced needed four block comments to be followed at all.
 */
function headlineName({
  firstName,
  group,
  newest,
  placeName,
  subject,
  subjects,
}: {
  firstName: string | undefined
  group: ActivityGroup
  newest: ActivityListItem
  placeName: string | undefined
  subject: ActivityEntity | null | undefined
  subjects: number
}): string | undefined {
  // An upload names what it was attached to, never the file: a file's own name is a cuid.
  // This holds for a lone photo as much as for five, so it is decided before `single`.
  if (activityEntry(newest)?.names === 'parent') {
    return placeName ?? firstName
  }

  // An entry with no `tombstone` stores no name to fall back on, by design: an ascent's value
  // column holds its ascent type. Once the ascent is gone there is nothing left on the row, and
  // the parent route is the only true name for it. Entries that DO declare a tombstone are left
  // alone, so a route deleted without a name still says so rather than borrowing its block.
  if (group.kind === 'single') {
    return headlineEntityName(newest, subject) ?? (activityEntry(newest)?.tombstone == null ? placeName : undefined)
  }

  // A group whose rows all point at ONE entity is about that entity, so it names it. Falling to
  // the parent here is what made four topo saves on Nordblock read as "edited Steinbruch", the
  // area the block hangs under. The parent is still the right answer for a burst spanning
  // several routes, where no single one is the subject.
  const [first, second] = subjects === 1 ? [firstName, placeName] : [placeName, firstName]
  return first ?? second ?? headlineEntityName(newest, undefined)
}

/**
 * What an ascent was logged with, or `undefined` when it was logged with nothing beyond its
 * type. A grade of nothing and a rating of no stars is what every ascent starts as, so drawing
 * the strip for one would put an empty row of placeholders on most session cards.
 */
function loggedAscent(entity: ActivityEntity | null | undefined): ActivityCardAscent | undefined {
  if (entity?.ascentType == null) {
    return undefined
  }

  const ascent = {
    gradeFk: entity.ascentGradeFk,
    humidity: entity.humidity,
    rating: entity.ascentRating,
    temperature: entity.temperature,
  }

  // A cleared rating is stored as 0, which is "no stars" rather than an opinion worth a strip.
  return ascent.gradeFk == null &&
    !(ascent.rating != null && ascent.rating > 0) &&
    ascent.humidity == null &&
    ascent.temperature == null
    ? undefined
    : ascent
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
 * The verb for a group that is one person making one kind of change to one entity, or
 * `undefined` when it is anything else.
 *
 * Ahead of the kind rules, because the kind answers a coarser question. Three edits to one
 * ascent are a `session` by kind and read as "You logged a session", which is not what
 * happened; four topo saves are a `burst` and read as "edited", which is true of everything.
 *
 * All three guards are load-bearing. Mixed actors have no single person to name. More than one
 * subject has no single entity for the sentence's `{name}`, so it would borrow the parent's and
 * report "You renamed Nordblock" for two renamed routes. Mixed keys have no one verb to speak.
 */
function sharedVerbKey(group: ActivityGroup, subjects: number, actors: number): MessageKey | undefined {
  if (subjects !== 1 || actors > 1) {
    return undefined
  }

  const [first, ...rest] = group.activities.map((activity) => activityEntry(activity)?.key)
  return first != null && rest.every((key) => key === first) ? first : undefined
}

/** The sub line under a grouped card's headline. A single card has none. */
function summaryParts(
  group: ActivityGroup,
  placeName: string | undefined,
  media: ActivityMedia,
  subjects: number,
  verb: CardVerb,
): ActivityMessagePart[] | undefined {
  // What a deletion took with it. Its own branch because it is the one summary a `single` card
  // has: every other kind counts rows and a card of one has nothing to count.
  const scale = deletionScaleParts(group)
  if (scale != null) {
    return scale
  }

  if (group.kind === 'single') {
    return undefined
  }

  // A create that picked up media counts the media, not the rows. "3 edits" for one route and
  // two photos counts the create as an edit and says nothing about what is on the card.
  if (verb.media != null) {
    return [{ key: 'activity_summaryFiles', params: { count: verb.media.length, media } }]
  }

  // Same idea from the other end: a card that only pulled files counts files. "2 edits" under
  // "You removed media from Kante direkt" reaches for the generic word for a card that already
  // knows it is about media, and `media` is the mixed-aware one the headline computed.
  if (group.activities.every((activity) => activity.columnName === 'file' && activity.type === 'deleted')) {
    return [{ key: 'activity_summaryFiles', params: { count: group.activities.length, media } }]
  }

  // Once the headline speaks the change itself ("You edited your ascent of Rampe"), the count
  // is of edits, whatever kind the group is. "1 ascent" under that sentence counts something
  // the reader was not asking about.
  const spoken = verb.shared != null

  // A session counts ascents, and three edits to one ascent are one ascent, not three. Every
  // other kind counts rows, which is what it says it counts: edits, files, removals.
  const count = !spoken && group.kind === 'session' ? subjects : group.activities.length
  const countKey: MessageKey = spoken
    ? 'activity_summaryEdits'
    : group.kind === 'session'
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

  if (verb.actors > 1) {
    parts.push({ key: 'activity_summaryPeople', params: { count: verb.actors } })
  }

  return parts
}
