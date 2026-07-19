import { m } from '$lib/paraglide/messages'
import { queries } from '$lib/zero/queries'
import { createResource, waitForRow } from '$lib/zero/resource.svelte'
import { toBlockDetail } from './mapper'

export interface BlockListFilter {
  areaId?: number
  content?: string
  /** Cap the result set (e.g. a search preview). */
  limit?: number
}

export function blockDetail(id: () => number) {
  return createResource(
    () => queries.block({ blockId: id() }),
    (row) => (row == null ? undefined : toBlockDetail(row)),
  )
}

export function blockList(filter: () => BlockListFilter = () => ({}), opts?: { enabled?: () => boolean }) {
  return createResource(
    () => queries.listBlocks(filter()),
    (rows) => rows.map(toBlockDetail),
    opts,
  )
}

/**
 * The block's routes, just the fields a route row needs. Reuses `queries.block`
 * (Zero dedupes it with the detail page's own instance), so the topos and this
 * list stay in sync. Order them with `orderRoutesByTopo` at the call site.
 */
export function blockRouteList(id: () => number) {
  return createResource(
    () => queries.block({ blockId: id() }),
    (row) =>
      (row?.routes ?? []).map((route) => ({
        description: route.description ?? '',
        gradeFk: route.userGradeFk ?? undefined,
        id: route.id,
        name: route.name.length === 0 ? m.common_unnamed() : route.name,
        rating: route.userRating ?? 0,
        tags: route.tags.map((tag) => tag.tagFk),
      })),
  )
}

/** Resolve once Zero has the live block row for `id` locally, or after `timeoutMs`. See {@link waitForRow}. */
export function waitForBlock(id: number, timeoutMs = 5000): Promise<void> {
  return waitForRow(queries.block({ blockId: id }), (row) => row != null, timeoutMs)
}
