import type { DisplayName } from '$lib/entities/displayName'
import type { Geolocation } from '$lib/entities/geolocation/dto'

export interface AreaDetail extends AreaListItem {
  createdAt: Date | undefined
  createdBy: number
  description: string
  geoPaths: string[]
  parkingLocations: Geolocation[]
  regionFk: number
}

export interface AreaListItem {
  areas: AreaListItem[]
  id: number
  /** From `toDisplayName`, so it is never blank. A plain string will not assign here. */
  name: DisplayName
  type: 'area' | 'crag' | null
}
