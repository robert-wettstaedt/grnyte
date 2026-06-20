import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
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
