import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
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
