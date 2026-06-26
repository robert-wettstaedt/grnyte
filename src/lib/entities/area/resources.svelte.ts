import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { getZ } from '$lib/zero/z.svelte'
import { toAreaDetail } from './mapper'

export interface AreaListFilter {
  content?: string
  parentFk?: number
}

export function areaList(filter: () => AreaListFilter = () => ({})) {
  return createResource(
    () => queries.listAreas(filter()),
    (rows) => rows.map(toAreaDetail),
  )
}

export function areaDetail(id: () => number) {
  return createResource(
    () => queries.area({ id: id() }),
    (row) => (row == null ? undefined : toAreaDetail(row)),
  )
}

/**
 * Resolve once Zero has the live area row for `id` in the local store, or after
 * `timeoutMs`. A server write (Drizzle) reaches Zero only after the sync engine
 * replicates it, so navigating to a just-restored area races that lag and flashes
 * "not found". Awaiting this before navigation defers it until the row is there.
 * ponytail: 5s cap is the ceiling — a slower sync just navigates to the loading state.
 */
export function waitForArea(id: number, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const view = getZ().materialize(queries.area({ id }))
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
