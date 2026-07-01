import { m } from '$lib/paraglide/messages'
import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { getZ } from '$lib/zero/z.svelte'
import { toBlockDetail } from './mapper'

export interface AreaListFilter {
  areaId?: number
  content?: string
}

export function blockList(filter: () => AreaListFilter = () => ({})) {
  return createResource(
    () => queries.listBlocks(filter()),
    (rows) => rows.map(toBlockDetail),
  )
}

export function blockDetail(id: () => number) {
  return createResource(
    () => queries.block({ blockId: id() }),
    (row) => (row == null ? undefined : toBlockDetail(row)),
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
        id: route.id,
        name: route.name.length === 0 ? m.common_unnamed() : route.name,
        gradeFk: route.gradeFk ?? undefined,
        rating: route.rating ?? 0,
      })),
  )
}

/**
 * Resolve once Zero has the live block row for `id` locally, or after `timeoutMs`.
 * Mirrors {@link waitForArea}: defers a post-restore redirect until the recreated
 * row has synced, so the block detail renders instead of flashing "not found".
 * ponytail: 5s cap is the ceiling — a slower sync just lands on the loading state.
 */
export function waitForBlock(id: number, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const view = getZ().materialize(queries.block({ blockId: id }))
    const finish = () => {
      clearTimeout(timer)
      view.destroy()
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    view.addListener((row) => {
      if (row != null) finish()
    })
  })
}
