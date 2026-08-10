import type { Notification } from '$lib/zero/zero-schema.gen'

/** The entity kinds a notification points at. Derived from `notifications.entity_type`. */
export type NotificationEntityType = Notification['entityType']

/**
 * One row of the inbox, ready to render.
 *
 * `entityId` is `text` and `entityType` is polymorphic, exactly as on `activities`, so Zero
 * cannot join a row to the thing it is about: the page collects ids per type and hydrates them
 * through the shared entity hydration.
 */
export interface NotificationListItem {
  /** Who caused it. Never the recipient: self-authored events are dropped at fan-out. */
  actorFk: number
  /** The actor's username; empty while the user row has not synced. */
  actorName: string
  createdAt: number
  entityId: string
  entityType: NotificationEntityType
  id: number
  /** Whatever the sentence needs that the entity cannot answer, e.g. the granted role. */
  metadata: string | undefined
  /** Epoch millis of when the reader opened the inbox on this row; `undefined` = unread. */
  readAt: number | undefined
  regionFk: number
  sourceType: NotificationSourceType
}

/** What a notification is about. Derived from `notifications.source_type`. */
export type NotificationSourceType = Notification['sourceType']
