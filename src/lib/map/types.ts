import type { IconName } from '$lib/components/Icon/icons'
import type { BlockDetail } from '$lib/entities/block/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'

export interface BlocksMapProps {
  blocks: BlockDetail[]
  /** Claims the camera for the open route. Omitted by maps that `focus` alone drives. */
  cameraClaim?: MapCameraClaim | null
  /** Pixels to lift the control column, so it rides above a sheet that covers the map. The caller
   *  owns the sheet, so it owns this number. Null keeps the resting position. */
  controlsLift?: null | number
  /** Tap-to-add-waypoint mode (parking path drawing): a tap emits `onpathpoint` instead of navigating. */
  drawPath?: boolean
  focus?: MapFocus | null
  /** Per-block route counts keyed by grade id (`gradeFk`), feeding the area/sector donut markers. */
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
  /** Every deliberate reader move, including the locate press. A picker marks itself edited from
   *  this instead of listing OpenLayers gestures. */
  onreadermove?: () => void
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

/** A geographic extent, `[minLat, minLng, maxLat, maxLng]`. Latitude first, the opposite of
 *  OpenLayers' lng-first order. */
export type Bounds = [number, number, number, number]

export interface LayerEntry {
  icon: IconName
  /** What the toggle acts on. Not the label: two regions may name one overlay differently, and two
   *  distinct overlays may share a name. */
  key: string
  label: string
  visible: boolean
}

/** The five marker layers toggle as one group. */
export const MARKERS_LAYER_KEY = 'markers'
export const OSM_LAYER_KEY = 'osm'

/** Who owns the camera, taken from the route and not from synced data, so it is set before `focus`
 *  can be computed. `key` identifies the claim, not the owner. Two reader claims are one owner, so
 *  they need different keys or the second is deduped away. */
export type MapCameraClaim = { key: string; kind: 'entity' | 'reader' }

/** The map-data subset produced by `createExploreMapData`, spread into `<Map>`. */
export type MapData = Pick<
  BlocksMapProps,
  'blocks' | 'gradeCountByBlock' | 'lineStrings' | 'parkingLocations' | 'routeCountByBlock'
>

export interface MapFocus {
  center?: [number, number] // [lat, lng]
  extent?: Bounds
  padding?: [number, number, number, number] // [top, right, bottom, left] in pixels
  zoom?: number
}

// Below SECTOR_ZOOM only the (outer) area rects show, so the far view isn't cluttered with
// every sector; from SECTOR_ZOOM the sector rects take over, and from BLOCK_ZOOM the blocks do.
export const SECTOR_ZOOM = 11
export const BLOCK_ZOOM = 14
export const BLOCK_LABEL_ZOOM = 15
