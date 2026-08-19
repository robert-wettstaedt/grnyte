import { getGlobalState } from '$lib/state/global.svelte'
import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toComment } from './mapper'

/** How much further back "load earlier" reaches each time, matching the query's first window. */
export const COMMENT_PAGE_SIZE = 30

export interface CommentListFilter {
  eventId: number
  /** Sync window. Defaults to the query's 30; bump it to reach further back. */
  limit?: number
}

/**
 * One event's thread, oldest first.
 *
 * Pass `enabled` and this costs nothing until it is true, which is the point: the feed shows a
 * count off the event row, and the conversation itself syncs when a reader opens the sheet. The
 * same idiom as the feed's `userList(..., { enabled: () => filtersOpen })`.
 *
 * Reversed here rather than in the query. The window has to be taken off the NEWEST end (see
 * `listComments`), and a thread is read from the oldest, so exactly one of the two is a `reverse`
 * and it belongs on the side that renders.
 */
export function commentList(filter: () => CommentListFilter, opts?: { enabled?: () => boolean }) {
  const global = getGlobalState()

  return createResource(
    () => queries.listComments(filter()),
    (rows) => rows.map((row) => toComment(row, global.user?.id)).reverse(),
    opts,
  )
}
