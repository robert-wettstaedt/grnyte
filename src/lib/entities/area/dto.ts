import type { Geolocation } from '$lib/entities/geolocation/dto'

export interface AreaListItem {
  id: number
  name: string
  type: 'area' | 'crag'
  areas: AreaListItem[]
}

export interface AreaDetail extends AreaListItem {
  regionFk: number
  description: string | undefined
  createdAt: Date | undefined
  parkingLocations: Geolocation[]
  geoPaths: string[]
}
