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
