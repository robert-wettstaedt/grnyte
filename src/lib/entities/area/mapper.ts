import { toGeolocation } from '$lib/entities/geolocation/mapper'
import type { Row } from '$lib/zero/types'
import type { AreaDetail, AreaListItem } from './dto'

/** Minimal shape of an area node walked when collecting ancestors: satisfied
 * by an area row or any query's `area`/`parent` relation, however deeply nested. */
export interface AreaAncestor {
  readonly id: number
  readonly name: string
  readonly parent?: AreaAncestor | undefined
  // Zero marks this optional (the column carries a DB default), so it can arrive null even
  // though the DB itself is non-null; callers coalesce to 'area'.
  readonly type: 'area' | 'crag' | null
}

/** What `toAreaDetail` reads: satisfied by both the list and the single-area query. */
export interface AreaDetailRow extends AreaAncestor {
  readonly createdAt: null | number
  readonly createdBy: number
  readonly description: null | string
  readonly geoPaths: null | readonly string[]
  readonly parkingLocations: readonly Row<'geolocations'>[]
  readonly regionFk: number
}

export function toAncestors(row: AreaAncestor | undefined): AreaListItem[] {
  const ancestors: AreaListItem[] = []

  let current = row?.parent
  while (current != null) {
    ancestors.unshift({
      areas: [],
      id: current.id,
      name: current.name,
      type: current.type,
    })
    current = current.parent
  }

  return ancestors
}

export function toAreaDetail(row: AreaDetailRow): AreaDetail {
  return {
    ...toAreaListItem(row),
    createdAt: row.createdAt == null ? undefined : new Date(row.createdAt),
    createdBy: row.createdBy,
    description: row.description ?? '',
    geoPaths: row.geoPaths == null ? [] : [...row.geoPaths],
    parkingLocations: row.parkingLocations.map(toGeolocation),
    regionFk: row.regionFk,
  }
}

export function toAreaListItem(row: AreaAncestor): AreaListItem {
  return {
    areas: toAncestors(row),
    id: row.id,
    name: row.name,
    type: row.type,
  }
}
