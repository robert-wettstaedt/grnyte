import type { IconName } from '$lib/components/Icon/icons'
import type { BlockDetail } from '$lib/entities/block/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'

export interface BlocksMapProps {
  blocks: BlockDetail[]
  /** Tap-to-add-waypoint mode (parking path drawing): a tap emits `onpathpoint` instead of navigating. */
  drawPath?: boolean
  focus?: MapFocus | null
  /** Per-block route counts keyed by grade id (`gradeFk`), feeding the area/crag donut markers. */
  gradeCountByBlock?: Map<number, Map<number, number>>
  lineStrings?: null | string[]
  /** Fired synchronously when a tapped feature is about to navigate to its detail sheet,
   *  before the click bubbles to document, so the sheet can suppress its outside-click collapse. */
  onfeatureopen?: () => void
  /** Fired with the pressed `[lat, lng]` on touch long-press or mouse right-click
   *  (the quick-create entry point). Also suppresses the browser context menu. */
  onlongpress?: (point: [number, number]) => void
  /** Emits the tapped `[lat, lng]` while in `drawPath` mode. */
  onpathpoint?: (point: [number, number]) => void
  onviewchange?: (view: { center: [number, number]; zoom: number }) => void
  parkingLocations?: Geolocation[]
  /** Path to draw as a dashed line, as `[lat, lng]` points. */
  pathLine?: [number, number][]
  /** When true, map features stop being clickable (used by the parking picker,
   *  which reads the map *center* rather than navigating to tapped features). */
  pickMode?: boolean
  routeCountByBlock?: Map<number, number>
  /** Block to highlight and lift above overlapping markers (the open block detail page). */
  selectedBlockId?: number
  /** A static thumbnail: hides control chrome and disables pan/zoom, so only `focus` drives the view. */
  static?: boolean
}

export interface LayerEntry {
  icon: IconName
  label: string
  name: string
  visible: boolean
}

/** The map-data subset produced by `createExploreMapData`, spread into `<Map>`. */
export type MapData = Pick<
  BlocksMapProps,
  'blocks' | 'gradeCountByBlock' | 'lineStrings' | 'parkingLocations' | 'routeCountByBlock'
>

export interface MapFocus {
  center?: [number, number] // [lat, lng]
  extent?: [number, number, number, number] // [minLat, minLng, maxLat, maxLng]
  padding?: [number, number, number, number] // [top, right, bottom, left] in pixels
  zoom?: number
}

// Below CRAG_ZOOM only the (outer) area rects show, so the far view isn't cluttered with
// every crag; from CRAG_ZOOM the crag rects take over, and from BLOCK_ZOOM the blocks do.
export const CRAG_ZOOM = 11
export const BLOCK_ZOOM = 14
export const BLOCK_LABEL_ZOOM = 15
