import { toGeolocation } from '$lib/entities/geolocation/mapper'
import type { Row } from '$lib/zero/types'
import type { AreaDetail, AreaListItem } from './dto'

/** Minimal shape of an area node walked when collecting ancestors — satisfied
 * by an area row or any query's `area`/`parent` relation, however deeply nested. */
export interface AreaAncestor {
  readonly id: number
  readonly name: string
  // Zero marks this optional (the column carries a DB default), so it can arrive null even
  // though the DB itself is non-null; callers coalesce to 'area'.
  readonly type: 'area' | 'crag' | null
  readonly parent?: AreaAncestor | undefined
}

/** What `toAreaDetail` reads — satisfied by both the list and the single-area query. */
export interface AreaDetailRow extends AreaAncestor {
  readonly regionFk: number
  readonly description: string | null
  readonly createdAt: number | null
  readonly parkingLocations: readonly Row<'geolocations'>[]
  readonly geoPaths: readonly string[] | null
}

export function toAncestors(row: AreaAncestor | undefined): AreaListItem[] {
  const ancestors: AreaListItem[] = []

  let current = row?.parent
  while (current != null) {
    ancestors.unshift({
      areas: [],
      id: current.id,
      name: current.name,
      type: current.type ?? 'area',
    })
    current = current.parent
  }

  return ancestors
}

export function toAreaListItem(row: AreaAncestor): AreaListItem {
  return {
    id: row.id,
    name: row.name,
    type: row.type ?? 'area',
    areas: toAncestors(row),
  }
}

export function toAreaDetail(row: AreaDetailRow): AreaDetail {
  return {
    ...toAreaListItem(row),
    regionFk: row.regionFk,
    description: row.description ?? undefined,
    createdAt: row.createdAt == null ? undefined : new Date(row.createdAt),
    parkingLocations: row.parkingLocations.map(toGeolocation),
    geoPaths: row.geoPaths == null ? [] : [...row.geoPaths],
  }
}
