import { queries } from '$lib/zero/queries'
import { createResource, waitForRow } from '$lib/zero/resource.svelte'
import { toAreaDetail } from './mapper'

export interface AreaListFilter {
  content?: string
  /** Cap the result set (e.g. a search preview). */
  limit?: number
  /** Parent area id; `null` filters to top-level areas (no parent), omitted means no filter. */
  parentFk?: null | number
  /** Find areas whose description references the given `!type:id!` token (backlinks). */
  references?: string
}

export function areaDetail(id: () => number) {
  return createResource(
    () => queries.area({ id: id() }),
    (row) => (row == null ? undefined : toAreaDetail(row)),
  )
}

export function areaList(filter: () => AreaListFilter = () => ({}), opts?: { enabled?: () => boolean }) {
  return createResource(
    () => queries.listAreas(filter()),
    (rows) => rows.map(toAreaDetail),
    opts,
  )
}

/** Resolve once Zero has the live area row for `id` locally, or after `timeoutMs`. See {@link waitForRow}. */
export function waitForArea(id: number, timeoutMs = 5000): Promise<void> {
  return waitForRow(queries.area({ id }), (row) => row != null, timeoutMs)
}
