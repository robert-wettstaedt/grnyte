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
  /** Per-block route counts keyed by grade id (`gradeFk`), feeding the area/crag donut markers. */
  gradeCountByBlock?: Map<number, Map<number, number>>
  focus?: MapFocus | null
  /** Block to highlight and lift above overlapping markers (the open block detail page). */
  selectedBlockId?: number
  onviewchange?: (view: { center: [number, number]; zoom: number }) => void
  /** When true, map features stop being clickable (used by the parking picker,
   *  which reads the map *center* rather than navigating to tapped features). */
  pickMode?: boolean
  /** A static thumbnail: hides control chrome and disables pan/zoom, so only `focus` drives the view. */
  static?: boolean
  /** Tap-to-add-waypoint mode (parking path drawing): a tap emits `onpathpoint` instead of navigating. */
  drawPath?: boolean
  /** Path to draw as a dashed line, as `[lat, lng]` points. */
  pathLine?: [number, number][]
  /** Emits the tapped `[lat, lng]` while in `drawPath` mode. */
  onpathpoint?: (point: [number, number]) => void
  /** Fired synchronously when a tapped feature is about to navigate to its detail sheet —
   *  before the click bubbles to document, so the sheet can suppress its outside-click collapse. */
  onfeatureopen?: () => void
}

/** The map-data subset produced by `createExploreMapData`, spread into `<Map>`. */
export type MapData = Pick<
  BlocksMapProps,
  'blocks' | 'parkingLocations' | 'lineStrings' | 'routeCountByBlock' | 'gradeCountByBlock'
>

export interface LayerEntry {
  name: string
  icon: IconName
  label: string
  visible: boolean
}

// Below CRAG_ZOOM only the (outer) area rects show, so the far view isn't cluttered with
// every crag; from CRAG_ZOOM the crag rects take over, and from BLOCK_ZOOM the blocks do.
export const CRAG_ZOOM = 11
export const BLOCK_ZOOM = 14
export const BLOCK_LABEL_ZOOM = 15
