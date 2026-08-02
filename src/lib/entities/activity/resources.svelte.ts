import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import type { ActivityCategory, ActivityEntityType } from './dto'
import { toActivity } from './mapper'

export interface ActivityListFilter {
  /** Only rows newer than this id: what has landed since the reader last looked. */
  afterId?: number
  /** Ascents, or every other kind of edit. */
  category?: ActivityCategory
  /** Sync window. Defaults to the query's 50; bump it to load older rows. */
  limit?: number
  /** Narrow to one region when the user belongs to several. */
  regionFk?: number
  /** Scope to one entity: its own rows plus the rows its children logged against it. */
  scope?: { id: string; type: ActivityEntityType }
  /** Only rows at or older than this id: the window the reader has acknowledged. */
  upToId?: number
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
