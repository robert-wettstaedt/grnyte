import type { AscentType } from '$lib/entities/ascent/dto'
import { mediaWord, type MediaFile } from '$lib/entities/file/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'
import type { TopoView } from '$lib/entities/topo/dto'
import type { MessageKey } from '$lib/i18n/message'
import { calendarDay } from '$lib/i18n/relativeTime'
import { changeViews, storedMedia, type ChangeView, type MediaWord } from './change'
import {
  catalogueParentRef,
  eventEntityKey,
  eventRefs,
  lineRef,
  type EventEntity,
  type EventEntityMap,
  type EventEntityRef,
} from './entity'
import type { EventGroupKind } from './grouping'
import type { CardLine } from './line'
import { parseDeletedAscent, parseDeletionScale, verbEntry, verbKey } from './verbs'

/**
 * What a card renders: the lines one group of events produced, and how it presents them.
 *
 * Built by `eventCard` from an `EventGroup`. There is no second grouping function any more: the
 * feed folds events, and a card expands each of them into its lines.
 */
export interface CardGroup {
  /** The actor. Every group key carries one, so every line on a card shares it. */
  actorFk: number
  /** Epoch millis of the group's newest event: what the feed sorts and dates by. */
  createdAt: number
  /** Keying id for `{#each}`, carried through from the event group. */
  id: string
  kind: EventGroupKind
  /**
   * Newest first, with one deliberate exception: a group that merged an upload into the create it
   * belongs to leads with that create, since the headline reads the card's verb off the front.
   * Never empty.
   */
  rows: CardLine[]
}

/** A card never lists more than a handful of rows; the rest collapse into a count. */
const MAX_ROWS = 4

/**
 * What one ascent was logged with, beyond its type. The route row next to it renders the
 * community grade and the community rating; these are one climber's take, which is why they
 * render as their own labelled strip rather than as a second pair of numbers on the row.
 */
export interface CardAscent {
  gradeFk: number | undefined
  humidity: number | undefined
  rating: number | undefined
  temperature: number | undefined
}

export interface CardHeadline {
  /** The sentence to render, straight out of the verb catalogue. */
  key: MessageKey
  params: { media: MediaWord; owner: 'none' | 'other' | 'self'; person: 'other' | 'self' }
}

/**
 * One entity row on a card, and which of the three shapes it takes. `skeleton` means the
 * entity has not synced yet, `tombstone` that hydration finished without it, so it is gone.
 */
export interface CardRow {
  /**
   * What THIS ascent was logged with, when one of the lines behind the row logged it.
   *
   * Per row rather than per card, because a session is five ascents with five opinions and a
   * card-level strip could only ever show one of them: four climbers' grades and stars went
   * missing on every session card. Absent on a row a card merely edited, whose change lines
   * already say what moved.
   */
  ascent: CardAscent | undefined
  entity: EventEntity | undefined
  /** The name to show on a tombstone, taken off the newest line that named the entity. */
  name: string | undefined
  /** What the climber wrote about this ascent, quoted under its row. Unlike {@link ascent} an
   *  edit card shows it too: the change lines say which number moved and nothing says this. */
  note: string | undefined
  ref: EventEntityRef
  state: 'entity' | 'skeleton' | 'tombstone'
}

/**
 * Everything a card says, decided before any markup touches it.
 *
 * Message keys and their params come out of here, never resolved copy: a test can then
 * assert that a removed photo picks `event_routeDeletedFile` without asserting on the
 * English or German sentence that key happens to hold this week. What stays in the
 * component is what genuinely cannot leave it: the relative clock, the grade labels that
 * need `globalState`, and the expand toggle.
 */
export interface CardView {
  /** The actor's username. Empty while the user row has not synced. */
  actorName: string
  /** The expanded half: one decided line per changed column. See `change.ts`. */
  changes: ChangeView[]
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
  headline: CardHeadline
  /** `{#each}` key. Carried through from the group so a card keeps its expand state. */
  id: string
  /** Whether the signed-in user is the actor, which makes the card read "You ...". */
  mine: boolean
  /** Rows beyond {@link MAX_ROWS}, reported as a count instead of rendered. */
  overflowCount: number
  /** The pin a block was placed with, when this is the card that placed it. */
  pin: Geolocation | undefined
  rows: CardRow[]
  /** The ascent's type, when the card is about a new ascent. Drives the status glyph. */
  status: AscentType | undefined
  summary: MessagePart[] | undefined
}

/** A piece of a composed line: a message to resolve, or text that is already a name. */
export type MessagePart =
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
  /** The files on a create-that-picked-up-media, which both halves speak for. */
  media: CardLine[] | undefined
  /** The one verb every row shares, when they share one. */
  shared: MessageKey | undefined
  /** The clips a session picked up: how many, and which word they agree on. */
  uploads: undefined | { count: number; media: MediaWord }
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
export function cardView(
  group: CardGroup,
  entities: EventEntityMap | undefined,
  currentUserFk: number | undefined,
  topos?: ReadonlyMap<number, TopoView>,
  omit?: EventEntityRef,
): CardView {
  const newest = group.rows[0]
  // What the card points AT, what it renders as rows and the place it happened in are three
  // different questions off one pass. An upload points at a file, which supplies the media and
  // no row; the row belongs to the route or ascent it landed on. The place is not rendered as a
  // row at all (the edits below it are), only named, in the headline and the session summary.
  const { place, rows: allRowRefs, subjects: refs } = eventRefs(group.rows)
  const entityOf = (ref: EventEntityRef | undefined) => (ref == null ? undefined : entities?.get(eventEntityKey(ref)))

  // Dropped here rather than in the component so `overflowCount` counts what is left: a scoped
  // log whose rows were all the scope entity would otherwise read "3 more" under no rows at all.
  const omitKey = omit == null ? undefined : eventEntityKey(omit)
  const rowRefs = omitKey == null ? allRowRefs : allRowRefs.filter((ref) => eventEntityKey(ref) !== omitKey)

  const placeName = named(entityOf(place)?.name)
  const firstName = named(entityOf(refs[0])?.name)

  // The clips a session picked up, counted and worded off those lines alone. The card-wide word
  // answers a different question: it reads every file hanging off every entity on the card, so a
  // session that added one video to an ascent photographed last week called it "1 media".
  const uploaded =
    group.kind === 'session'
      ? group.rows.filter((activity) => activity.objectType === 'file' && activity.verb === 'add')
      : []
  // One word per LINE, `none` for a line whose file is gone. Reading the files the lines resolved
  // to instead let two clips with one deleted since be counted as two and worded as one, which is
  // the count-and-word disagreement this exists to prevent.
  const uploadKinds = new Set(
    uploaded.map((activity) => {
      const files = entityOf(lineRef(activity))?.files ?? []
      return files.length === 1 ? mediaWord(files[0]) : 'none'
    }),
  )

  // Once, for both halves of the card. See `CardVerb`.
  const verb: CardVerb = {
    media: createdWithMedia(group),
    shared: sharedVerbKey(group, refs.length),
    uploads:
      uploaded.length === 0
        ? undefined
        : { count: uploaded.length, media: uploadKinds.size === 1 ? [...uploadKinds][0] : 'none' },
  }
  const spoken = spokenLine(group, verb)

  const entityName = headlineName({
    firstName,
    newest,
    placeName,
    spoken,
    subject: entityOf(spoken == null ? refs[0] : lineRef(spoken)),
    subjects: refs.length,
  })

  // No name is coming: an entity arrives with its event, so there is no second wave to wait for.
  // This used to hold the slot pulsing until every ref it could come from had answered, which is
  // what a separate hydration pass needed; `card.ts` overrode it with exactly this.
  const entityUnnamed = entityName == null

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
  const recorded = group.rows
    .map((activity) => (activity.objectType === 'ascent' ? parseDeletedAscent(activity.metadata) : undefined))
    .find((entry) => entry != null)
  const climberFk = climber?.climberFk ?? recorded?.climberFk
  const owner = climberFk == null ? 'none' : climberFk === newest.actorFk ? 'self' : 'other'
  const mine = currentUserFk != null && group.actorFk === currentUserFk

  // Keyed by id: a merged create-plus-media group holds the ascent AND the file it landed on,
  // and the ascent hydrates with that same file hanging off it, so the flat list would carry
  // it twice - once as the ascent's, once as its own row's - and the keyed `{#each}` that
  // draws the thumbnails would see two of one key.
  const files = [...new Map(refs.flatMap((ref) => entityOf(ref)?.files ?? []).map((file) => [file.id, file])).values()]
  // Photo or video. An upload reads it off the hydrated file rather than the row, which only
  // records that a file was added: reading the row would leave every upload logged before
  // this saying "photo". The word settles when the file syncs, alongside the name beside it.
  // A removal has no file left to read and so carries the word itself (see `deleteFile`).
  const kinds = new Set(files.map(mediaWord))
  // A removal card reads its word off every row it holds, not just the newest: a submit that
  // pulled a photo and a video is neither, and `none` is the arm that says "media".
  const removed = new Set(
    group.rows.filter((activity) => activity.columnName === 'file').map((activity) => storedMedia(activity.oldValue)),
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
  const created = group.rows.flatMap((activity) => (activity.verb === 'create' ? [entityOf(lineRef(activity))] : []))
  // Only when the card created exactly one thing. Two creates have two pins and no row to hang
  // either on, and a create-plus-media group is still one create.
  //
  // ponytail: the ascent numbers moved onto their own rows for exactly this reason; the pin has
  // not, so a burst that placed two blocks still draws the first one's map. Upgrade = a pin per
  // row, once a card that places two blocks at once is a thing anybody does.
  const lone = created.length === 1 ? created[0] : undefined

  const rows = rowRefs.slice(0, MAX_ROWS).map((ref): CardRow => {
    const entity = entityOf(ref)
    // The lines that put this row on the card, not the group's newest line: a burst spanning two
    // deleted routes must not label both tombstones with the same name, and a session's five rows
    // each carry their own ascent.
    const lines = catalogueRowsFor(group.rows, ref)
    // The newest of them for the name, since a rename's stored name is the one it ended on. The
    // CREATE for the strip, whichever position it sits in: a log at nine and a correction at six
    // are two events on one session card and one row, and gating on the newest line left that row
    // with no grade, no stars and no conditions because an update happened to be on top.
    const createLine = lines.find((activity) => activity.verb === 'create')

    return {
      ascent: createLine == null ? undefined : loggedAscent(entity),
      entity: entity ?? undefined,
      name: lines[0] == null ? undefined : headlineEntityName(lines[0], null),
      // No create guard, unlike the strip. An edit card withholds the numbers because its change
      // lines already say which one moved, and it says nothing at all about what the climber
      // wrote, so the note is context there rather than a repetition.
      note: named(entity?.note),
      ref,
      state: entity === undefined ? 'skeleton' : entity === null ? 'tombstone' : 'entity',
    }
  })
  // A session logs several ascents at once, so the date is the card's only when they agree on
  // one. Whether it is worth saying is a question about calendar days, not elapsed time: see
  // `calendarDay`.
  const climbDates = new Set(created.map((entity) => entity?.climbedAt))
  const climbedAt = climbDates.size === 1 ? [...climbDates][0] : undefined

  return {
    actorName: newest.actorName,
    changes: changeViews(group.rows, { entities, topos }),
    climbedAt: climbedAt != null && climbedAt !== calendarDay(group.createdAt) ? climbedAt : undefined,
    climberName: climber?.climberName ?? recorded?.climberName,
    createdAt: group.createdAt,
    entityName,
    entityUnnamed,
    files,
    headline: {
      key: spoken == null ? groupVerbKey(group) : verbKey(spoken),
      params: { media, owner, person: mine ? 'self' : 'other' },
    },
    id: group.id,
    mine,
    overflowCount: Math.max(0, rowRefs.length - MAX_ROWS),
    pin: lone?.pin,
    rows,
    // Only for a card that speaks one ascent's own sentence. A session says "You logged a
    // session" over a flash, a repeat and an attempt, and the glyph beside that headline claimed
    // the whole afternoon was whichever one happened to be newest; each row carries its own.
    //
    // Declared on the entry, so the cast is reachable only for the four lines that carry an
    // ascent type in `value`.
    status: spoken != null && verbEntry(spoken)?.status === 'ascentType' ? (spoken.value as AscentType) : undefined,
    summary: summaryParts(group, placeName, media, spoken, verb),
  }
}

/**
 * The name a headline puts in its `{name}` slot: the stored one where the entry says the subject
 * is stored, the hydrated one where there is one, and the tombstone the row wrote down otherwise.
 *
 * Exported because the push digest renders the same sentences from the same catalogue and must
 * resolve the name the same way. A deleted area's name only exists in `oldValue`, and an
 * invitation deliberately has no hydrated subject at all, so a digest that consulted the database
 * alone would announce both with `common_unnamed`.
 */
export function headlineEntityName(activity: CardLine, entity: EventEntity | null | undefined): string | undefined {
  const entry = verbEntry(activity)

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
 * The lines that put `ref` on the card, in the order the card holds them: those ABOUT it, else
 * those that named it as their parent.
 *
 * Two stages for the same reason `claim` in `card.ts` has two: an upload is about a file and draws
 * the row of the thing the photos landed on, so matching on the object alone misses every upload
 * row. Compared through `lineRef`, which is what makes the numeric id a line carries and the text
 * id a ref carries comparable at all.
 *
 * All of them rather than one, because the callers want different ones: the name comes off the
 * first (newest, except on a merged card that leads with its create) and the opinion strip off the
 * create, and a row can hold both (an ascent logged in the morning and corrected in the evening is
 * two events on one session card).
 *
 * Empty rather than the whole list when nothing matches. Falling back to the first line was how a
 * card holding two deleted routes labelled both tombstones with the first one's name, and a row
 * nothing on the card speaks for has no name and no strip, which is the honest answer.
 */
function catalogueRowsFor(rows: readonly CardLine[], ref: EventEntityRef): CardLine[] {
  const key = eventEntityKey(ref)
  const own = rows.filter((activity) => eventEntityKey(lineRef(activity)) === key)

  return own.length > 0
    ? own
    : rows.filter((activity) => {
        const parent = catalogueParentRef(activity)
        return parent != null && eventEntityKey(parent) === key
      })
}

/**
 * The file rows on a group whose leading row created the thing they landed on, or `undefined`
 * when that is not what the group is. `mergeCreatedWithMedia` builds these; both the headline
 * and the summary have to recognise one, so the test lives in one place.
 */
function createdWithMedia(group: CardGroup): CardLine[] | undefined {
  // Exactly one create, and it leads. A session takes uploads too now and keeps its own order, so
  // a clip that landed between two logged ascents left a create on top of a card holding several:
  // "You flashed Riss" over three rows, counting one video where the reader did three things.
  // `mergeCreatedWithMedia` only puts a create at the front when it speaks for the whole card.
  if (group.rows[0]?.verb !== 'create' || group.rows.filter((activity) => activity.verb === 'create').length !== 1) {
    return undefined
  }

  const files = group.rows.filter((activity) => activity.objectType === 'file')
  return files.length > 0 ? files : undefined
}

/**
 * "12 blocks, 200 routes" under a deletion, summed over every row on the card.
 *
 * `undefined` when nothing on the card recorded a scale, which covers every deletion logged
 * before the writers started counting as well as every card that is not a deletion.
 */
function deletionScaleParts(group: CardGroup): MessagePart[] | undefined {
  const totals = { areas: 0, blocks: 0, routes: 0 }

  for (const activity of group.rows) {
    const scale = activity.verb === 'delete' ? parseDeletionScale(activity.metadata) : undefined
    totals.areas += scale?.areas ?? 0
    totals.blocks += scale?.blocks ?? 0
    totals.routes += scale?.routes ?? 0
  }

  // No separate "nothing was recorded" flag: `stringifyDeletionScale` only ever writes counts
  // above zero, so a card with no scale on it and a card whose scale is all zeroes are the same
  // card, and the empty list below is what both of them mean.
  const parts: MessagePart[] = [
    ...(totals.areas > 0 ? [{ key: 'event_summaryAreas' as const, params: { count: totals.areas } }] : []),
    ...(totals.blocks > 0 ? [{ key: 'event_summaryBlocks' as const, params: { count: totals.blocks } }] : []),
    ...(totals.routes > 0 ? [{ key: 'event_summaryRoutes' as const, params: { count: totals.routes } }] : []),
  ]

  return parts.length === 0 ? undefined : parts
}

/**
 * The headline key for a card that summarises. What it does NOT cover is a card speaking one
 * line's own sentence, which {@link spokenLine} answers first. The count lives in the summary,
 * so these stay one sentence per key.
 */
function groupVerbKey(group: CardGroup): MessageKey {
  if (group.kind === 'session') {
    return 'event_groupSession'
  }

  if (group.kind === 'upload') {
    return 'event_groupUploads'
  }

  // No `{name}`: what a removal card would name is exactly what it just deleted, so the slot
  // would be the `common_unnamed` placeholder on every card that did not stash a name.
  if (group.kind === 'removal') {
    return 'event_groupRemovals'
  }

  // A card that only pulled files says so, in the media word the sub line is already counting in.
  // Without this the headline reads "You edited Nordblock" over "2 photos", which is byte for byte
  // what an UPLOAD card says: the reader sees photos gained where two are gone for good. Not
  // `event_groupRemovals` either, which is about entities ("You deleted entries") and reads as a
  // route or a block having gone rather than a photo.
  if (group.rows.every((row) => row.columnName === 'file' && row.verb === 'remove')) {
    return 'event_groupFilesRemoved'
  }

  return 'event_groupEdits'
}

/**
 * The name a card's headline puts in `{name}`, in the order the four rules apply.
 *
 * Early returns rather than one expression: the rules do not compose, they override each other,
 * and the nested ternary this replaced needed four block comments to be followed at all.
 */
function headlineName({
  firstName,
  newest,
  placeName,
  spoken,
  subject,
  subjects,
}: {
  firstName: string | undefined
  newest: CardLine
  placeName: string | undefined
  spoken: CardLine | undefined
  subject: EventEntity | null | undefined
  subjects: number
}): string | undefined {
  // An upload names what it was attached to, never the file: a file's own name is a cuid.
  // This holds for a lone photo as much as for five, so it is decided before the rest.
  if (verbEntry(newest)?.names === 'parent') {
    return placeName ?? firstName
  }

  // A card that speaks one line's own sentence names that line's own subject, whether it holds one
  // line or twelve: "You added the route Kante direkt" over the two photos that came with it, not
  // over the block they landed in.
  //
  // An entry with no `tombstone` stores no name to fall back on, by design: an ascent's value
  // column holds its ascent type. Once the ascent is gone there is nothing left on the row, and
  // the parent route is the only true name for it. Entries that DO declare a tombstone are left
  // alone, so a route deleted without a name still says so rather than borrowing its block.
  if (spoken != null) {
    return headlineEntityName(spoken, subject) ?? (verbEntry(spoken)?.tombstone == null ? placeName : undefined)
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
function loggedAscent(entity: EventEntity | null | undefined): CardAscent | undefined {
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
 * Both guards are load-bearing. More than one subject has no single entity for the sentence's
 * `{name}`, so it would borrow the parent's and report "You renamed Nordblock" for two renamed
 * routes. Mixed keys have no one verb to speak.
 */
function sharedVerbKey(group: CardGroup, subjects: number): MessageKey | undefined {
  if (subjects !== 1) {
    return undefined
  }

  const [first, ...rest] = group.rows.map((activity) => verbEntry(activity)?.key)
  return first != null && rest.every((key) => key === first) ? first : undefined
}

/**
 * The line whose OWN sentence the card speaks, or `undefined` for a card that summarises
 * several.
 *
 * Always the first line where there is one, which is what `mergeCreatedWithMedia` puts the
 * create at the front for. Two things read this: the headline, and the ascent glyph beside the
 * clock. The glyph used to read the newest line unconditionally, so a session of a flash, a
 * repeat and an attempt wore whichever glyph sorted first over "You logged a session".
 */
function spokenLine(group: CardGroup, verb: CardVerb): CardLine | undefined {
  // A card of one, a create that picked up media ("You flashed Rampe", the clip below it), and
  // one person saying one thing about one entity several times over. Everything else is a
  // summary, because "redpointed Rampe" would name one of four ascents.
  if (group.kind === 'single' || verb.media != null || verb.shared != null) {
    return group.rows[0]
  }

  // One climb logged and then corrected is not a session. The correction is a second event once it
  // falls outside the 15 minute fold, and the card read "You logged a session" over a sub line
  // saying "1 ascent", which is the card contradicting itself about how much happened. The create
  // has a sentence for exactly this and the changes toggle still holds the correction.
  const creates = group.rows.filter((activity) => activity.verb === 'create')
  const oneSubject = new Set(group.rows.map((activity) => eventEntityKey(lineRef(activity)))).size === 1

  return group.kind === 'session' && creates.length === 1 && oneSubject ? creates[0] : undefined
}

/** The sub line under a grouped card's headline. A single card has none. */
function summaryParts(
  group: CardGroup,
  placeName: string | undefined,
  media: MediaWord,
  spoken: CardLine | undefined,
  verb: CardVerb,
): MessagePart[] | undefined {
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
    return [{ key: 'event_summaryFiles', params: { count: verb.media.length, media } }]
  }

  // Same idea from the other end: a card that only pulled files counts files. "2 edits" under
  // "You removed media from Kante direkt" reaches for the generic word for a card that already
  // knows it is about media, and `media` is the mixed-aware one the headline computed.
  if (group.rows.every((activity) => activity.columnName === 'file' && activity.verb === 'remove')) {
    return [{ key: 'event_summaryFiles', params: { count: group.rows.length, media } }]
  }

  // Once the headline speaks the change itself ("You edited your ascent of Rampe"), the count is of
  // EDITS, whatever kind the group is: "1 ascent" under that sentence counts something the reader
  // was not asking about. A create is not an edit, so a card that speaks its create and holds one
  // correction says "1 edit" rather than counting the log itself.
  const edits =
    spoken == null ? undefined : group.rows.length - group.rows.filter((row) => row.verb === 'create').length

  // A session counts ASCENTS, and three edits to one ascent are one ascent, not three. Counted off
  // the rows rather than off the card's subjects, because a session holds the clips hung on those
  // climbs too and a file is a subject: counting subjects read "5 ascents" for three climbs and
  // two videos. Every other kind counts rows, which is what it says it counts: edits, removals.
  const climbs = new Set(
    group.rows.flatMap((activity) => (activity.objectType === 'ascent' ? [String(activity.objectId)] : [])),
  ).size
  const count = edits ?? (group.kind === 'session' ? climbs : group.rows.length)
  const countKey: MessageKey =
    edits != null
      ? 'event_summaryEdits'
      : group.kind === 'session'
        ? 'event_summaryAscents'
        : group.kind === 'upload'
          ? 'event_summaryFiles'
          : group.kind === 'removal'
            ? 'event_summaryRemovals'
            : 'event_summaryEdits'

  // Only the file count says what it counted; the other three count one thing each. A spoken
  // sentence with nothing to count keeps no sub line at all, the way a card of one does.
  const parts: MessagePart[] =
    count === 0 ? [] : [{ key: countKey, params: group.kind === 'upload' ? { count, media } : { count } }]

  // A spoken sentence already names its entity, and so does an edits headline. A session's and a
  // removal's do not.
  if (spoken == null && (group.kind === 'session' || group.kind === 'removal') && placeName != null) {
    parts.push({ text: placeName })
  }

  // The clips hung on those climbs, which a session card holds since the merge stopped leaving
  // them on cards of their own. The count says what it counted, the same as an upload card's.
  if (group.kind === 'session' && verb.uploads != null) {
    parts.push({ key: 'event_summaryFiles', params: verb.uploads })
  }

  return parts
}
