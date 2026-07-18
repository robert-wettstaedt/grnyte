import type { Geolocation } from '$lib/entities/geolocation/dto'

export interface AreaDetail extends AreaListItem {
  createdAt: Date | undefined
  description: string | undefined
  geoPaths: string[]
  parkingLocations: Geolocation[]
  regionFk: number
}

export interface AreaListItem {
  areas: AreaListItem[]
  id: number
  name: string
  type: 'area' | 'crag' | null
}
