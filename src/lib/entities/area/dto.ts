import type { Geolocation } from '$lib/entities/geolocation/dto'

export interface AreaListItem {
  id: number
  name: string
  slug: string
  type: 'area' | 'crag' | 'sector'
  areas: AreaListItem[]
}

export interface AreaDetail extends AreaListItem {
  description: string | undefined
  createdAt: Date | undefined
  parkingLocations: Geolocation[]
  geoPaths: string[]
}
