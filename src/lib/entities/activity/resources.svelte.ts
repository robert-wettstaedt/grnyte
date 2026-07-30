import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import type { ActivityCategory, ActivityEntityType } from './dto'
import { toActivity } from './mapper'

export interface ActivityListFilter {
  /** Ascents, or every other kind of edit. */
  category?: ActivityCategory
  /** Sync window. Defaults to the query's 50; bump it to load older rows. */
  limit?: number
  /** Narrow to one region when the user belongs to several. */
  regionFk?: number
  /** Scope to one entity: its own rows plus the rows its children logged against it. */
  scope?: { id: string; type: ActivityEntityType }
  /** Narrow to one actor. */
  userFk?: number
}

export function activityList(filter: () => ActivityListFilter = () => ({}), opts?: { enabled?: () => boolean }) {
  return createResource(
    () => queries.listActivities(filter()),
    (rows) => rows.map(toActivity),
    opts,
  )
}
