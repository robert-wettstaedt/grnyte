import type { IconName } from '$lib/components/Icon/icons'
import type { BlockDetail } from '$lib/entities/block/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'

export interface MapFocus {
  center?: [number, number] // [lat, lng]
  extent?: [number, number, number, number] // [minLat, minLng, maxLat, maxLng]
  zoom?: number
  padding?: [number, number, number, number] // [top, right, bottom, left] in pixels
}

export interface BlocksMapProps {
  blocks: BlockDetail[]
  parkingLocations?: Geolocation[]
  lineStrings?: string[] | null
  routeCountByBlock?: Map<number, number>
  focus?: MapFocus | null
  onviewchange?: (view: { center: [number, number]; zoom: number }) => void
}

export interface LayerEntry {
  name: string
  icon: IconName
  label: string
  visible: boolean
}

export const SECTOR_ZOOM = 11
export const BLOCK_ZOOM = 14
export const BLOCK_LABEL_ZOOM = 15
