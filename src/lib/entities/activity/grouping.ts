import { isSameDay } from 'date-fns'
import type { ActivityListItem } from './dto'

export interface ActivityGroup {
  /** Newest first, like the input. Never empty. */
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
  const sorted = [...activities].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
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

  return groups.map(({ group, key }) => ({
    ...group,
    id: `${key}#${group.activities[group.activities.length - 1].id}`,
    kind: group.activities.length === 1 ? ('single' as const) : group.kind,
  }))
}

function groupKey(activity: ActivityListItem, kind: ActivityGroupKind): string {
  switch (kind) {
    // No day in the key: `joins` decides, so a log running past local midnight stays one
    // session instead of splitting in two.
    case 'session':
      return `session:${activity.userFk}`

    // All three key on the actor plus the place, and are kept apart so neither a submit of
    // five photos nor a deletion lands inside "made 12 edits in Nordblock": the reader would
    // then have to unpick the card to notice either.
    case 'burst':
    case 'removal':
    case 'upload':
      return `${kind}:${activity.userFk}:${localityKey(activity)}`

    default:
      return `entity:${activity.entityType}:${activity.entityId}`
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
