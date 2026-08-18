import type { EventObjectType } from '$lib/entities/event/dto'
import type { EventEntity } from '$lib/entities/event/entity'
import type { Notification } from '$lib/zero/zero-schema.gen'

/**
 * One row of the inbox, ready to render.
 *
 * A notification names its object in the same six typed columns an event does, so the thing it is
 * about arrives nested with the row and no second pass joins anything.
 */
export interface NotificationListItem {
  /** Who caused it. Never the recipient: self-authored events are dropped at fan-out. */
  actorFk: number
  /** The actor's username; empty while the user row has not synced. */
  actorName: string
  createdAt: number
  /**
   * The thing this row is about, ready to draw. Absent when no object is set, which is what a row
   * backfilled from a pair pointing at something already deleted ends up as.
   */
  entity: EventEntity | undefined
  id: number
  /** Whatever the sentence needs that the entity cannot answer, e.g. the granted role. */
  metadata: string | undefined
  /** Which object, from whichever typed column is set. Absent when none is. */
  object: undefined | { id: number | string; type: EventObjectType }
  /** Epoch millis of when the reader opened the inbox on this row; `undefined` = unread. */
  readAt: number | undefined
  regionFk: number
  sourceType: NotificationSourceType
}

/** What a notification is about. Derived from `notifications.source_type`. */
export type NotificationSourceType = Notification['sourceType']
