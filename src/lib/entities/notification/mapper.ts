import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { NotificationListItem } from './dto'

export type NotificationRow = QueryRow<typeof queries.listNotifications>

export function toNotification(row: NotificationRow): NotificationListItem {
  return {
    actorFk: row.actorFk,
    actorName: row.actor?.username ?? '',
    // `created_at` carries a DB default, which Zero types as nullable; it never is.
    createdAt: row.createdAt ?? 0,
    entityId: row.entityId,
    entityType: row.entityType,
    id: row.id,
    metadata: row.metadata ?? undefined,
    readAt: row.readAt ?? undefined,
    regionFk: row.regionFk,
    sourceType: row.sourceType,
  }
}
