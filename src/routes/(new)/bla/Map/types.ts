import type { Geolocation } from '$lib/db/schema'
import type { InferResultType } from '$lib/db/types'

export type NestedBlock = InferResultType<'blocks', { area: { with: { parent: true } }; geolocation: true }>

export interface MapFocus {
  center?: [number, number] // [lat, lng]
  extent?: [number, number, number, number] // [minLat, minLng, maxLat, maxLng]
  zoom?: number
  padding?: [number, number, number, number] // [top, right, bottom, left] in pixels
}

export interface BlocksMapProps {
  blocks: NestedBlock[]
  parkingLocations?: Geolocation[]
  lineStrings?: string[] | null
  routeCountByBlock?: Map<number, number>
  focus?: MapFocus | null
  onviewchange?: (view: { center: [number, number]; zoom: number }) => void
}

export interface LayerEntry {
  name: string
  icon: string
  label: string
  visible: boolean
}

export const SECTOR_ZOOM = 11
export const BLOCK_ZOOM = 14
export const BLOCK_LABEL_ZOOM = 15
