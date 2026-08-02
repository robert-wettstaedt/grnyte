import type { Activity } from '$lib/zero/zero-schema.gen'

/** What the feed's segmented control filters on: ascents versus every other kind of edit. */
export type ActivityCategory = 'ascent' | 'update'

/** The entity kinds an activity can point at. Derived from `activities.entity_type`. */
export type ActivityEntityType = Activity['entityType']

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
