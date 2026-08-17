import { isSameDay } from 'date-fns'
import type { EventListItem } from './mapper'

export interface EventGroup {
  /** The actor. `entity` groups can mix actors, so this is the newest event's one. */
  actorFk: number
  /** Epoch millis of the group's newest event: what the feed sorts and dates by. */
  createdAt: number
  /**
   * Newest first, like the input, with one deliberate exception: a group that merged an upload
   * into the create it belongs to leads with that create, since the headline reads the card's verb
   * off the front. Never empty.
   */
  events: EventListItem[]
  /**
   * Keying id for `{#each}`. The group's own key plus its oldest member, so a card keeps its
   * identity (and its expand state) when newer events join it.
   *
   * Nothing is stored against this any more. A reaction hangs off an event, which has an id of its
   * own that no amount of regrouping can change, so a card re-keying at the window's edge is now
   * only a rendering detail rather than something that could orphan a row.
   */
  id: string
  kind: EventGroupKind
}

/**
 * How a card presents its events:
 * - `session` one climber's ascents logged in one sitting
 * - `burst`   one editor's crag edits around the same place, close in time
 * - `removal` one editor's whole-entity deletions around the same place, close in time
 * - `upload`  one uploader's media landing on the same entity, close in time
 * - `entity`  anyone's edits to the same entity, close in time
 * - `single`  a group that ended up with one event
 */
export type EventGroupKind = 'burst' | 'entity' | 'removal' | 'session' | 'single' | 'upload'

/** How far apart two events can be and still share a burst or entity card. */
const BURST_MS = 30 * 60 * 1000

const CRAG_OBJECT_TYPES = new Set(['area', 'block', 'route'])

/**
 * Fold a newest-first event list into feed cards. Session beats burst beats entity, first match
 * wins, and a group of one becomes a `single` card.
 *
 * Grouping is now purely cosmetic. It used to be a correctness concern, because a reaction was
 * stored against one row of a card and every surface had to agree on which rows made that card up;
 * an event has its own id, so regrouping cannot move anything.
 *
 * ponytail: sessions and bursts still key on the actor plus the immediate parent rather than the
 * design's "same area". The event now carries the whole chain (a route's block, that block's
 * area), so keying on the crag is finally possible without a second pass. Left alone here on
 * purpose: it changes which cards merge, which is a feed behaviour decision rather than part of
 * moving the read path over.
 *
 * ponytail: a session is still "logged together" (`createdAt`), not "climbed together"
 * (`ascents.dateTime`). The climb date is on the event now (`entity.climbedAt`), so this is also
 * unblocked, and also deliberately unchanged for the same reason.
 */
export function groupEvents(events: readonly EventListItem[]): EventGroup[] {
  const sorted = [...events].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
  const groups: { group: EventGroup; key: string }[] = []
  // Only the newest group per key is still open; an older one is already out of window.
  const open = new Map<string, EventGroup>()

  for (const event of sorted) {
    const kind = kindOf(event)
    const key = groupKey(event, kind)
    const current = open.get(key)

    // The list runs newest first, so a group's last entry is its oldest so far and the window is
    // measured against that.
    if (current != null && joins(current.events[current.events.length - 1], event, kind)) {
      current.events.push(event)
      continue
    }

    const group: EventGroup = {
      actorFk: event.actorFk,
      createdAt: event.createdAt,
      events: [event],
      id: key,
      kind,
    }
    groups.push({ group, key })
    open.set(key, group)
  }

  return mergeCreatedWithMedia(groups).map(({ group, key }) => ({
    ...group,
    id: `${key}#${oldestId(group.events)}`,
    kind: group.events.length === 1 ? ('single' as const) : group.kind,
  }))
}

const objectKey = (type: string, id: number | string) => `${type}:${id}`

const createKey = (actorFk: number, type: string, id: number | string) => `${actorFk}:${objectKey(type, id)}`

/**
 * Every key carries the region.
 *
 * Two regions are two places, and the same person doing the same thing in each is two events. It
 * bites hardest on a user object, whose id is the same person in every region they belong to:
 * without this, granting somebody a role in one region and another role in a second folded into one
 * card that reported neither correctly.
 */
function groupKey(event: EventListItem, kind: EventGroupKind): string {
  const region = event.regionFk

  switch (kind) {
    // No day in the key: `joins` decides, so a log running past local midnight stays one session
    // instead of splitting in two.
    case 'session':
      return `session:${region}:${event.actorFk}`

    // All three key on the actor plus the place, and are kept apart so neither a submit of five
    // photos nor a deletion lands inside "made 12 edits in Nordblock": the reader would then have
    // to unpick the card to notice either.
    case 'burst':
    case 'removal':
    case 'upload':
      return `${kind}:${region}:${event.actorFk}:${localityKey(event)}`

    // `metadata` is in the key for the same reason the server's fold scopes on it: two
    // invitations by one person are deliberately two events, and a user object's id is the same
    // person for every one of them. Without it the client merged back together exactly what the
    // write path spends effort keeping apart, into a card that can only headline one address.
    default:
      return `entity:${region}:${objectKey(event.objectType, event.objectId)}:${event.metadata ?? ''}`
  }
}

/** Whether `event` still belongs to the open group whose oldest member is `oldest`. */
function joins(oldest: EventListItem, event: EventListItem, kind: EventGroupKind): boolean {
  const withinWindow = oldest.createdAt - event.createdAt <= BURST_MS
  return kind === 'session' ? withinWindow || isSameDay(oldest.createdAt, event.createdAt) : withinWindow
}

function kindOf(event: EventListItem): EventGroupKind {
  // A deletion is the one thing on a card nobody may have to infer from a tombstone row, so it is
  // kept out of the edit bursts. Under the old shape this needed "type is deleted AND there is no
  // column", because a column-scoped delete (a photo, a parking pin) is really an edit; here those
  // are `remove` and `update`, so the verb says it outright.
  if (event.verb === 'delete') {
    return 'removal'
  }

  // An upload's object is the FILE, so it groups on the parent it landed on. Without that it would
  // key on the file's own id, which is unique per file, and a submit of five photos would render as
  // five cards.
  //
  // Only the uploads: an event that edits a file's column (a video's source) is housekeeping on one
  // clip, and grouping it by parent would fold it into "added 5 photos to Nordblock", where a
  // reader would have to unpick the card to notice it at all.
  if (event.objectType === 'file') {
    return event.verb === 'add' ? 'upload' : 'entity'
  }

  // A photo added to or pulled off an ascent is media housekeeping, not a send, and must stay out
  // of the session card or it inflates "sent 4 routes today".
  //
  // Only half of that is free. An UPLOAD's object is the file, so it never reaches here. A REMOVAL
  // logs on the parent, because the file row is gone by then, so it arrives as `ascent` + `remove`
  // and does need saying out loud, exactly as the old `columnName !== 'file'` guard did.
  if (event.objectType === 'ascent') {
    return event.verb === 'remove' ? 'entity' : 'session'
  }

  return CRAG_OBJECT_TYPES.has(event.objectType) ? 'burst' : 'entity'
}

/** The closest thing to "same place" an event carries: its parent, or itself. */
function localityKey(event: EventListItem): string {
  return event.parent == null
    ? objectKey(event.objectType, event.objectId)
    : objectKey(event.parent.type, event.parent.id)
}

/**
 * Fold an upload group into the group that created the thing it landed on.
 *
 * Adding a route with two photos, or logging an ascent with a clip, is one action. Nothing in the
 * keys can bring the two halves together: the create keys on the block it sits under and the
 * uploads key on the route they hang off, so they agree on neither subject nor parent. The link is
 * that one group's subject is the other group's parent, which only shows up once the groups exist.
 *
 * The create moves to the front of the merged group. It is the older event (files are finalized
 * after the entity exists) and the card speaks for whatever comes first, so leaving the order alone
 * would turn "You added the route Kante direkt" into "You added photos to it".
 *
 * Only a `create` target, deliberately. Folding uploads into an edit burst would hide a submit of
 * five photos inside "made 12 edits in Nordblock", which is the exact thing the separate `upload`
 * kind exists to prevent.
 */
function mergeCreatedWithMedia(groups: { group: EventGroup; key: string }[]): { group: EventGroup; key: string }[] {
  const merged = new Set<EventGroup>()
  // Indexed by the create each group is about, so an upload finds its half in one lookup instead of
  // rescanning every group on the page for every submit.
  //
  // Exactly one create, deliberately. A session that logged three ascents and hung a clip on one of
  // them is a session: folding the upload in would make the card speak that one ascent's verb ("You
  // flashed Rampe") and count "1 video" for an afternoon in which the reader did three things.
  // Nothing is lost by leaving them apart, since the upload keeps its own card naming the ascent it
  // landed on.
  const byCreate = new Map<string, { create: EventListItem; entry: (typeof groups)[number] }[]>()

  for (const entry of groups) {
    const creates = entry.group.events.filter((event) => event.verb === 'create')
    if (creates.length !== 1) {
      continue
    }

    const create = creates[0]
    const key = createKey(entry.group.actorFk, create.objectType, create.objectId)
    const existing = byCreate.get(key)
    if (existing == null) {
      byCreate.set(key, [{ create, entry }])
    } else {
      existing.push({ create, entry })
    }
  }

  for (const { group } of groups) {
    if (group.kind !== 'upload') {
      continue
    }

    const parent = group.events[0].parent
    if (parent == null || !group.events.every((event) => sameParent(event, parent))) {
      continue
    }

    const target = byCreate
      .get(createKey(group.actorFk, parent.type, parent.id))
      ?.find(({ entry }) => entry.group !== group && !merged.has(entry.group) && withinBurst(entry.group, group))

    if (target != null) {
      // The create leads, and everything else keeps the newest-first order the rest of the feed
      // reads in. Sorting the whole thing would bury the create under the uploads it speaks for.
      const { create } = target
      const rest = [...target.entry.group.events.filter((event) => event !== create), ...group.events].sort(
        (a, b) => b.createdAt - a.createdAt || b.id - a.id,
      )
      target.entry.group.events = [create, ...rest]
      // `createdAt` deliberately NOT bumped to the upload's. The returned array is in
      // first-event order and nothing re-sorts it, so raising the create's timestamp past its
      // neighbours leaves the card sitting below an older one. The card dates by the action it
      // speaks for, which is the create.
      merged.add(group)
    }
  }

  return groups.filter(({ group }) => !merged.has(group))
}

/**
 * The smallest id in the group, which is the half of a card's identity that does not move as newer
 * events join it.
 *
 * Deliberately NOT called "the oldest": backfilled ids do not run with their timestamps, which is
 * why the feed's cursor is a `(createdAt, id)` pair rather than an id. What this needs is only a
 * value that is stable as the group grows, and the minimum id is that whether or not it is also
 * the earliest. Reading the last position instead re-keyed merged cards, which lead with their
 * create rather than their smallest, and dropped their expand state.
 */
function oldestId(events: readonly EventListItem[]): number {
  return events.reduce((lowest, event) => Math.min(lowest, event.id), Infinity)
}

function sameParent(event: EventListItem, parent: { id: number | string; type: string }): boolean {
  return event.parent?.id === parent.id && event.parent.type === parent.type
}

function withinBurst(a: EventGroup, b: EventGroup): boolean {
  return Math.abs(a.createdAt - b.createdAt) <= BURST_MS
}
