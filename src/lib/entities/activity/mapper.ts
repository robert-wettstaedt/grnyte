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
    // Rows written before the writers guarded `String(parentFk)` carry the literal "null";
    // treat that as absent so top-level areas don't all group under one phantom parent.
    parentEntityId: row.parentEntityId == null || row.parentEntityId === 'null' ? undefined : row.parentEntityId,
    parentEntityType: row.parentEntityType ?? undefined,
    regionFk: row.regionFk,
    type: row.type,
    userFk: row.userFk,
    userName: row.user?.username ?? '',
  }
}
