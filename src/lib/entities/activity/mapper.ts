import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import { toActivityListItem, type ActivityListItem } from './dto'

export type ActivityRow = QueryRow<typeof queries.listActivities>

export function toActivity(row: ActivityRow): ActivityListItem {
  return toActivityListItem({ ...row, createdAt: row.createdAt ?? 0, userName: row.user?.username ?? '' })
}
