import type { Activity } from '$lib/zero/zero-schema.gen'

/** What the feed's segmented control filters on: ascents versus every other kind of edit. */
export type ActivityCategory = 'ascent' | 'update'

/**
 * Where the two categories are cut, once.
 *
 * The feed's Zero query filters on it and the push cron branches on it, and a rule stated in two
 * places is a rule that drifts: the digest would keep pushing as an ascent what the feed had
 * stopped classifying as one, and nothing would fail.
 */
export const ASCENT_SEGMENT = { entityType: 'ascent', mediaColumn: 'file' } as const

/** The entity kinds an activity can point at. Derived from `activities.entity_type`. */
export type ActivityEntityType = Activity['entityType']

/**
 * A row as either source stores it: every field the DTO leaves optional arrives nullable, and the
 * two fields neither source has verbatim (`createdAt` is a `Date` on the server and epoch millis in
 * Zero, `userName` lives on a joined row) are the caller's to resolve.
 */
export type ActivityFields = {
  [K in keyof ActivityListItem]: undefined extends ActivityListItem[K]
    ? ActivityListItem[K] | null
    : ActivityListItem[K]
}

/**
 * One row of the audit log, ready to render. `entityId` is `text` and `entityType` is
 * polymorphic, so Zero cannot join it to the entity it describes: the feed collects ids
 * per type and hydrates them through the per-entity list resources instead.
 */
export interface ActivityListItem {
  /** Only set on `updated` rows: the column that changed. */
  columnName: string | undefined
  /** Epoch millis of when the activity was logged. */
  createdAt: number
  /** The entity's id as text, even when the entity keys on a number. */
  entityId: string
  entityType: ActivityEntityType
  id: number
  /** Free-form JSON the writer attached, e.g. coordinates or a topo line count. */
  metadata: string | undefined
  newValue: string | undefined
  oldValue: string | undefined
  parentEntityId: string | undefined
  parentEntityType: ActivityParentEntityType | undefined
  regionFk: number
  type: ActivityType
  userFk: number
  /** The actor's username; empty while the user row hasn't synced. */
  userName: string
}

/** The entity kinds an activity can name as its parent. Derived from `activities.parent_entity_type`. */
export type ActivityParentEntityType = NonNullable<Activity['parentEntityType']>

export type ActivityType = Activity['type']

/**
 * Whether a row belongs to the feed's ascent segment.
 *
 * A photo pulled off an ascent does not: there `entityType` names the photo's owner rather than
 * what happened, and what happened is somebody editing the crag.
 */
export function isAscentActivity(activity: { columnName: null | string | undefined; entityType: string }): boolean {
  return activity.entityType === ASCENT_SEGMENT.entityType && activity.columnName !== ASCENT_SEGMENT.mediaColumn
}

/**
 * Null columns to absent ones, for either source.
 *
 * Both the feed and the digest run the same pure grouping and catalogue functions over the result,
 * so both have to normalise the same way; splitting the mapping in two is what let the `'null'`
 * guard below exist on one side only.
 */
export function toActivityListItem(row: ActivityFields): ActivityListItem {
  return {
    ...row,
    columnName: row.columnName ?? undefined,
    metadata: row.metadata ?? undefined,
    newValue: row.newValue ?? undefined,
    oldValue: row.oldValue ?? undefined,
    // Rows written before the cast moved into `insertActivity` carry the literal "null"; treat
    // that as absent so top-level areas don't all group under one phantom parent. Nothing can
    // write it any more, so this only has to outlive the rows that already have it.
    parentEntityId: row.parentEntityId == null || row.parentEntityId === 'null' ? undefined : row.parentEntityId,
    parentEntityType: row.parentEntityType ?? undefined,
  }
}
