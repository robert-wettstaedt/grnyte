import { isSameDay } from 'date-fns'
import type { ActivityListItem } from './dto'
import { activityParentRef } from './entity'

export interface ActivityGroup {
  /**
   * Newest first, like the input, with one deliberate exception: a group that merged an upload
   * into the create it belongs to leads with that create, since the headline reads the card's
   * verb off the front. Never empty.
   */
  activities: ActivityListItem[]
  /** Epoch millis of the group's newest activity: what the feed sorts and dates by. */
  createdAt: number
  /**
   * Keying id for `{#each}`. The group's own key plus its oldest member, so a card keeps
   * its identity (and its expand state) when newer activities join it. Loading older rows
   * can still re-key a card at the window's edge.
   */
  id: string
  kind: ActivityGroupKind
  /** The actor. `entity` groups can mix actors, so this is the newest activity's one. */
  userFk: number
}

/**
 * How a card presents its activities:
 * - `session` one climber's ascents logged in one sitting
 * - `burst`   one editor's crag edits around the same place, close in time
 * - `removal` one editor's whole-entity deletions around the same place, close in time
 * - `upload`  one uploader's media landing on the same entity, close in time
 * - `entity`  anyone's edits to the same entity, close in time
 * - `single`  a group that ended up with one activity
 */
export type ActivityGroupKind = 'burst' | 'entity' | 'removal' | 'session' | 'single' | 'upload'

/** How far apart two activities can be and still share a burst or entity card. */
const BURST_MS = 30 * 60 * 1000

const CRAG_ENTITY_TYPES = new Set(['area', 'block', 'route'])

/**
 * Fold a newest-first activity list into feed cards. Session beats burst beats entity,
 * first match wins, and a group of one becomes a `single` card.
 *
 * ponytail: sessions and bursts key on the actor plus the parent entity rather than the
 * design's "same area" - the row carries no area id, and resolving one needs a hydration
 * pass that only runs after grouping. Upgrade when a same-day two-crag session is a real
 * complaint.
 *
 * ponytail: a session here is "logged together" (`createdAt`), not "climbed together"
 * (`ascents.dateTime`, what the profile groups by) - the activity row carries no climb
 * date, so a Saturday session logged on Sunday dates as Sunday. Upgrade = write the climb
 * date into the activity row, rather than another client-side join.
 */
export function groupActivities(activities: readonly ActivityListItem[]): ActivityGroup[] {
  const sorted = withoutRedundantSource([...activities].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id))
  const groups: { group: ActivityGroup; key: string }[] = []
  // Only the newest group per key is still open; an older one is already out of window.
  const open = new Map<string, ActivityGroup>()

  for (const activity of sorted) {
    const kind = kindOf(activity)
    const key = groupKey(activity, kind)
    const current = open.get(key)

    // The list runs newest first, so a group's last entry is its oldest so far and the
    // window is measured against that.
    if (current != null && joins(current.activities[current.activities.length - 1], activity, kind)) {
      current.activities.push(activity)
      continue
    }

    const group: ActivityGroup = {
      activities: [activity],
      createdAt: activity.createdAt,
      id: key,
      kind,
      userFk: activity.userFk,
    }
    groups.push({ group, key })
    open.set(key, group)
  }

  return mergeCreatedWithMedia(groups).map(({ group, key }) => ({
    ...group,
    id: `${key}#${oldestId(group.activities)}`,
    kind: group.activities.length === 1 ? ('single' as const) : group.kind,
  }))
}

function createKey(userFk: number, entityType: string, entityId: string): string {
  return `${userFk}:${entityType}:${entityId}`
}

/**
 * Every key carries the region.
 *
 * Two regions are two places, and the same person doing the same thing in each is two events.
 * It bites hardest on a user row, whose id is the same person in every region they belong to:
 * without this, granting somebody a role in one region and another role in a second folded
 * into one card that reported neither correctly.
 */
function groupKey(activity: ActivityListItem, kind: ActivityGroupKind): string {
  const region = activity.regionFk

  switch (kind) {
    // No day in the key: `joins` decides, so a log running past local midnight stays one
    // session instead of splitting in two.
    case 'session':
      return `session:${region}:${activity.userFk}`

    // All three key on the actor plus the place, and are kept apart so neither a submit of
    // five photos nor a deletion lands inside "made 12 edits in Nordblock": the reader would
    // then have to unpick the card to notice either.
    case 'burst':
    case 'removal':
    case 'upload':
      return `${kind}:${region}:${activity.userFk}:${localityKey(activity)}`

    default:
      return `entity:${region}:${activity.entityType}:${activity.entityId}`
  }
}

/** Whether `activity` still belongs to the open group whose oldest member is `oldest`. */
function joins(oldest: ActivityListItem, activity: ActivityListItem, kind: ActivityGroupKind): boolean {
  const withinWindow = oldest.createdAt - activity.createdAt <= BURST_MS
  return kind === 'session' ? withinWindow || isSameDay(oldest.createdAt, activity.createdAt) : withinWindow
}

function kindOf(activity: ActivityListItem): ActivityGroupKind {
  // A row with no column is about the entity itself, so a `deleted` one is the entity being
  // gone. Folded in with the edits it renders as "edited", and a deletion is the one thing on
  // a card nobody may have to infer from a tombstone row. A column-scoped delete (a photo, a
  // parking pin) really is an edit and stays with them.
  if (activity.type === 'deleted' && activity.columnName == null) {
    return 'removal'
  }

  // An upload row points at the FILE and names what it was attached to as its parent, so it
  // groups on that parent. Without this it would key on the file's own id, which is unique
  // per file, and a submit of five photos would render as five cards.
  //
  // Only the uploads: a file row that edits a column (a video's source) is housekeeping on one
  // clip, and grouping it by parent would fold it into "added 5 photos to Nordblock", where a
  // reader would have to unpick the card to notice it at all.
  if (activity.entityType === 'file') {
    return activity.type === 'uploaded' ? 'upload' : 'entity'
  }

  // A photo added to or pulled off an ascent is media housekeeping, not an ascent: keeping it
  // out of the session card stops it inflating "sent 4 routes today".
  if (activity.entityType === 'ascent' && activity.columnName !== 'file') {
    return 'session'
  }

  return CRAG_ENTITY_TYPES.has(activity.entityType) ? 'burst' : 'entity'
}

/** The closest thing to "same place" an activity row carries: its parent, or itself. */
function localityKey(activity: ActivityListItem): string {
  return activity.parentEntityId == null
    ? `${activity.entityType}:${activity.entityId}`
    : `${activity.parentEntityType}:${activity.parentEntityId}`
}

/**
 * Fold an upload group into the group that created the thing it landed on.
 *
 * Adding a route with two photos, or logging an ascent with a clip, is one event. Nothing in
 * the keys can bring the two halves together: the create keys on the block it sits under and
 * the uploads key on the route they hang off, so they agree on neither subject nor parent. The
 * link is that one group's subject is the other group's parent, which only shows up once the
 * groups exist.
 *
 * The create moves to the front of the merged group. It is the older row (the files are
 * finalized after the entity exists) and the card speaks for whatever comes first, so leaving
 * the order alone would turn "You added the route Kante direkt" into "You added photos to it".
 *
 * Only a `created` target, deliberately. Folding uploads into an edit burst would hide a
 * submit of five photos inside "made 12 edits in Nordblock", which is the exact thing the
 * separate `upload` kind exists to prevent.
 */
function mergeCreatedWithMedia(
  groups: { group: ActivityGroup; key: string }[],
): { group: ActivityGroup; key: string }[] {
  const merged = new Set<ActivityGroup>()
  // Indexed by the create each group is about, so an upload finds its half in one lookup
  // instead of rescanning every group on the page for every submit.
  //
  // Exactly one create, deliberately. A session that logged three ascents and hung a clip on
  // one of them is a session: folding the upload in would make the card speak that one
  // ascent's verb ("You flashed Rampe") and count "1 video" for an afternoon in which the
  // reader did three things. Nothing is lost by leaving them apart, since the upload keeps
  // its own card naming the ascent it landed on.
  const byCreate = new Map<string, { create: ActivityListItem; entry: (typeof groups)[number] }[]>()

  for (const entry of groups) {
    const creates = entry.group.activities.filter((activity) => activity.type === 'created')
    if (creates.length !== 1) {
      continue
    }

    const create = creates[0]
    const key = createKey(entry.group.userFk, create.entityType, create.entityId)
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

    const parent = activityParentRef(group.activities[0])
    if (parent == null || !group.activities.every((activity) => sameParent(activity, parent))) {
      continue
    }

    const target = byCreate
      .get(createKey(group.userFk, parent.type, parent.id))
      ?.find(({ entry }) => entry.group !== group && !merged.has(entry.group) && withinBurst(entry.group, group))

    if (target != null) {
      // The create leads, and everything else keeps the newest-first order the rest of the
      // feed reads in. Sorting the whole thing would bury the create under the uploads it
      // precedes, which is what the headline reads off the front to say "You added the route
      // Kante direkt" rather than "You added photos to it".
      const rest = [
        ...target.entry.group.activities.filter((activity) => activity !== target.create),
        ...group.activities,
      ]
      rest.sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
      target.entry.group.activities = [target.create, ...rest]
      merged.add(group)
    }
  }

  return groups.filter(({ group }) => !merged.has(group))
}

/**
 * The id of a group's oldest activity, which is the half of a card's identity that does not
 * move as newer rows join it.
 *
 * Read off the smallest id rather than the last position: ids are serial, so the oldest row is
 * the smallest one however the list is ordered, and a merged group deliberately leads with its
 * create instead of its oldest. Taking the last entry re-keyed those cards and dropped their
 * expand state whenever the merge changed what sat at the end.
 */
function oldestId(activities: readonly ActivityListItem[]): number {
  return activities.reduce((oldest, activity) => Math.min(oldest, activity.id), Infinity)
}

function sameParent(activity: ActivityListItem, parent: { id: string; type: string }): boolean {
  return activity.parentEntityId === parent.id && activity.parentEntityType === parent.type
}

/** Whether two groups overlap closely enough in time to be one event. */
function withinBurst(a: ActivityGroup, b: ActivityGroup): boolean {
  return Math.abs(a.createdAt - b.createdAt) <= BURST_MS
}

/**
 * Drop a source edit that landed with the upload it is about.
 *
 * Pasting a link while adding a clip writes two rows, and the second one says nothing the first
 * does not: the card already draws the clip and names where it went. Setting the source during
 * the upload itself writes only the upload row, so this keeps the two paths reading the same.
 *
 * Only a source the file never had. A correction has something of its own to say ("filmed by"
 * changed to a different channel), and dropping it on the strength of the timestamp alone hid
 * an edit the climber made deliberately.
 *
 * ponytail: filtered here rather than never written. A row that only the feed hides is still a
 * row every other reader sees, and the windowed query can put the upload and its source edit on
 * either side of a page seam, where this stops recognising the pair. Upgrade = suppress it at
 * write time in `createUpdateActivity`, which already drops updates landing on a fresh create.
 */
function withoutRedundantSource(sorted: ActivityListItem[]): ActivityListItem[] {
  // Indexed by the file, so each source row asks one question instead of scanning every upload.
  const uploads = new Map<string, number[]>()
  for (const activity of sorted) {
    if (activity.entityType === 'file' && activity.type === 'uploaded') {
      const key = `${activity.entityId}:${activity.userFk}`
      const times = uploads.get(key)
      if (times == null) {
        uploads.set(key, [activity.createdAt])
      } else {
        times.push(activity.createdAt)
      }
    }
  }

  return sorted.filter((activity) => {
    if (activity.entityType !== 'file' || activity.columnName !== 'source') {
      return true
    }

    if (activity.oldValue != null && activity.oldValue.length > 0) {
      return true
    }

    const times = uploads.get(`${activity.entityId}:${activity.userFk}`) ?? []
    return !times.some((at) => Math.abs(at - activity.createdAt) <= BURST_MS)
  })
}
