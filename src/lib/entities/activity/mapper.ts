import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { ActivityListItem } from './dto'

export type ActivityRow = QueryRow<typeof queries.listActivities>

export function toActivity(row: ActivityRow): ActivityListItem {
  return {
    columnName: row.columnName ?? undefined,
    createdAt: row.createdAt ?? 0,
    entityId: row.entityId,
    entityType: row.entityType,
    id: row.id,
    metadata: row.metadata ?? undefined,
    newValue: row.newValue ?? undefined,
    oldValue: row.oldValue ?? undefined,
    // Rows written before the cast moved into `insertActivity` carry the literal "null"; treat
    // that as absent so top-level areas don't all group under one phantom parent. Nothing can
    // write it any more, so this only has to outlive the rows that already have it.
    parentEntityId: row.parentEntityId == null || row.parentEntityId === 'null' ? undefined : row.parentEntityId,
    parentEntityType: row.parentEntityType ?? undefined,
    regionFk: row.regionFk,
    type: row.type,
    userFk: row.userFk,
    userName: row.user?.username ?? '',
  }
}
