import type { AreaListItem } from '$lib/entities/area/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'

export type BlockListItem = {
  areas: AreaListItem[]
  id: number
  name: string
  order: number
}

export type BlockDetail = BlockListItem & {
  createdAt: Date | undefined
  geolocation: Geolocation | undefined
}
