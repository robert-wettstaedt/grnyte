import type { Accolade } from '$lib/entities/ascent/accolade'
import type { AscentType } from '$lib/entities/ascent/dto'
import type { MediaFile } from '$lib/entities/file/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'
import type { RouteListItem } from '$lib/entities/route/dto'
import type { Coords } from '$lib/map/map'
import type { EventObjectType } from './dto'
import type { CardLine } from './line'
import { verbEntry } from './verbs'

/**
 * The hydration contract: what the feed has to fetch, and the shape it hands back.
 *
 * An event names its object polymorphically, so Zero cannot join a row to the entity it
 * describes. The ids are collected here, fetched through the per-entity list resources, and
 * joined in memory. What a card then *says* about those entities lives in `card.ts`.
 *
 * A ref's id is a STRING for every object type, where a line carries the number the mapper
 * handed over for five of the six. Everything that matches the two compares them as text.
 */

/** The slice of a route a card's row renders. A `RouteListItem` satisfies it. */
export type EntityRoute = Pick<
  RouteListItem,
  'description' | 'gradeFk' | 'name' | 'rating' | 'tags' | 'topoImagePath' | 'topoPoints'
>

/**
 * One hydrated entity, flattened into exactly what a card renders. Deliberately one
 * flat shape rather than a union per entity kind: the card picks a row component from
 * `row` and every other field is optional, so the feed's hydration pass maps four
 * different list resources into it without four different mappers.
 */
export interface EventEntity {
  /**
   * The one claim this send earned, decided when it was logged and stored on the ascent.
   *
   * Read rather than derived: the climber's twelve months of history is what it is measured
   * against, and syncing that to every reader of the feed to re-answer a question the write path
   * already answered is the cost this exists to avoid.
   */
  accolade?: Accolade
  /**
   * The climber's own grade opinion (`ascents.gradeFk`), which is NOT the community grade the
   * route row beside it renders. A card that logged one shows it in its own labelled strip,
   * because two grades side by side with nothing to tell them apart reads as a bug.
   */
  ascentGradeFk?: number
  /** The climber's own rating, in the same strip and for the same reason. */
  ascentRating?: number
  /** Ascent type when the row stands for an ascent, so its route row shows the status glyph. */
  ascentType?: AscentType
  /**
   * When the ascent was climbed (`ascents.dateTime`), which is not when it was logged. The
   * card's clock is the log time, so a session logged the morning after says so in its sub line.
   */
  climbedAt?: number
  /**
   * Whose ascent it is (`ascents.createdBy`). A region maintainer may edit anyone's, so the
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
  /** The ascent's humidity, half of the conditions pill in the same strip as the grade. */
  humidity?: number
  /** Display name; the card's headline interpolates it. */
  name: string
  /** An ascent's notes, quoted under the rows. */
  note?: string
  /**
   * The area's approach paths (`areas.geoPaths`, already decoded), drawn on the thumbnail of a
   * parking change. Only areas carry any, which is what keeps a block's location line pathless.
   */
  paths?: Coords[][]
  /**
   * The block's pin, drawn as a map thumbnail on the card that created it. The create row
   * carries no coordinates of its own, so this is the pin as it stands today.
   */
  pin?: Geolocation
  /** The route the row renders, for `route` rows. */
  route?: EntityRoute
  /** Which entity row the card renders. `none` renders the name alone. */
  row: 'area' | 'block' | 'none' | 'route' | 'user'
  /** The ascent's temperature, the other half of the conditions pill. */
  temperature?: number
  /** Thumbnail for block rows. */
  topoImagePath?: string
}

/**
 * The entities a set of lines names, keyed by {@link eventEntityKey}. A missing key and an
 * explicit `null` mean the same thing: the row is gone and the card draws a tombstone. They are
 * not two states any more, since an entity arrives nested with the row that names it.
 */
export type EventEntityMap = ReadonlyMap<string, EventEntity | null>

/** The polymorphic `(id, type)` pair a line points at. */
export interface EventEntityRef {
  id: string
  type: EventObjectType
}

/**
 * Which refs a window of lines points at, in each of the roles a card reads them in.
 *
 * One pass rather than three collectors. Every role answers the same question ("which ref, and in
 * what capacity") from the same declarations on a catalogue entry, and split across functions each
 * was free to read them differently: the card asked for subjects and rows separately and the
 * shared parent was a private copy of the guard in `card.ts`. Together they also walked and
 * deduped the same list per card, on every sync tick.
 *
 * There is no "everything to fetch" role any more. That list existed for a hydration pass that
 * went and got the entities a window pointed at; an event carries its own, so the only question
 * left is what the card says about them.
 */
export interface EventRefs {
  /**
   * The place the whole window agrees on, when it has one. That is what a burst headline names;
   * a window spanning two parents has no such place and falls back to its first subject.
   */
  place: EventEntityRef | undefined
  /**
   * The entities a card renders as rows, which is not always what its lines point at.
   *
   * An upload points at a file, whose name is a cuid and whose only page is the media viewer, so
   * the row worth showing is the thing it was attached to, which is exactly what the row already
   * names as its parent. An entry declaring `row: 'none'` renders none at all: a removed member
   * is out of the region, so the row would be a dead end even when the person still hydrates.
   */
  rows: EventEntityRef[]
  /**
   * What the lines are about, each listed once.
   *
   * A row whose entry declares `names: 'stored'` contributes nothing: its `objectId` does not
   * point at what the card is about. An invitation points at the inviter, so fetching it put the
   * inviter's row under a headline naming the invitee.
   */
  subjects: EventEntityRef[]
}

/**
 * What a line names as its parent, or `undefined` when it names none.
 *
 * Both halves have to be present to mean anything, and that guard was written out at four
 * separate call sites, each free to disagree with the others about what a half-filled pair is.
 */
export function catalogueParentRef(line: CardLine): EventEntityRef | undefined {
  return line.parentId == null || line.parentType == null
    ? undefined
    : { id: String(line.parentId), type: line.parentType }
}

/** Structurally typed rather than taking a whole ref: the events layer keys the same map from
 *  `(objectType, objectId)` pairs whose type it has not narrowed yet. */
export function eventEntityKey(ref: { id: string; type: string }): string {
  return `${ref.type}:${ref.id}`
}

export function eventRefs(rows: readonly CardLine[]): EventRefs {
  const subjects = new Map<string, EventEntityRef>()
  const rowRefs = new Map<string, EventEntityRef>()

  // An upload whose parent is itself on the card names no place of its own: a clip hangs off an
  // ascent that is one of the card's own subjects, so it agrees with the others about where this
  // happened rather than disagreeing. Without this a session on one route lost its name from the
  // sub line the moment somebody hung a video on one of the climbs.
  //
  // Only the entries that borrow their parent's row, and only when that parent is really here. A
  // line ABOUT the place keeps its vote, or a burst holding an edit to the block its routes sit
  // under would end up with no place at all.
  const own = new Set(rows.map((line) => eventEntityKey(lineRef(line))))
  const placed = rows.filter((line) => {
    const parent = catalogueParentRef(line)
    return parent == null || verbEntry(line)?.names !== 'parent' || !own.has(eventEntityKey(parent))
  })

  // The first row's parent is the candidate; a later row disagreeing with it means the window
  // spans more than one place and there is none to name.
  let place = placed.length === 0 ? undefined : catalogueParentRef(placed[0])

  for (const line of placed) {
    const parent = catalogueParentRef(line)
    if (place != null && (parent?.id !== place.id || parent.type !== place.type)) {
      place = undefined
    }
  }

  for (const line of rows) {
    const entry = verbEntry(line)
    const subject = lineRef(line)
    const parent = catalogueParentRef(line)

    if (entry?.names !== 'stored') {
      add(subjects, subject)
    }

    if (entry?.row !== 'none' && entry?.names !== 'stored') {
      // The entries that borrow the parent's name borrow its row for the same reason.
      add(rowRefs, entry?.names === 'parent' ? parent : subject)
    }
  }

  return { place, rows: [...rowRefs.values()], subjects: [...subjects.values()] }
}

/**
 * What a line is ABOUT, as a ref.
 *
 * The one place the id becomes text. A line carries the number the mapper handed over for five of
 * the six object types and a ref is a string for all six, so every site that matched the two
 * open-coded the conversion and one of them forgot it, which cost every tombstone on a multi-row
 * card its own name.
 */
export function lineRef(line: CardLine): EventEntityRef {
  return { id: String(line.objectId), type: line.objectType }
}

/** Keyed insertion order, which is how each role stays newest-first with no duplicates. */
function add(refs: Map<string, EventEntityRef>, ref: EventEntityRef | undefined): void {
  if (ref != null) {
    refs.set(eventEntityKey(ref), ref)
  }
}
