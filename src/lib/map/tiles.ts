/**
 * Web Mercator tile math, which is all a static map thumbnail needs.
 *
 * The app's map is OpenLayers on plain OSM *raster* tiles, so a thumbnail is a handful of
 * `<img>` tags at computed URLs rather than a second map instance: no WebGL context per card,
 * no static-map API key, no dependency. {@link StaticMap} is the component built on this.
 *
 * It also holds the one value the two renderers share ({@link APPROACH_COLOR}), because this is
 * the half of the pair that imports nothing.
 */
import type { Coords } from './map'

/**
 * The blue an approach path is drawn in, on the interactive map and on the thumbnails the feed
 * renders beside a card.
 *
 * Shared because those are two different renderers (OpenLayers and hand-written SVG) drawing the
 * same thing, and a reader who opens the map after seeing a card has to find what the card showed
 * them. Each used to spell the colour out.
 *
 * It sits here rather than beside `createPathLayer`, which is the renderer that actually paints it
 * on the map: see the note above the import in `layers.svelte.ts` for why that direction is the
 * only safe one.
 */
export const APPROACH_COLOR = 'rgba(30, 64, 175, 0.7)'

/** OSM serves 256 px tiles, and has no imagery past zoom 19. */
export const TILE_SIZE = 256
const MAX_ZOOM = 19

/** Where a lone pin lands. It has no span to fit, so {@link fitZoom} would always give it max
 *  zoom, which on OSM is a featureless patch with no road or place label to place it by. */
const POINT_ZOOM = 16

/** Room to keep between the outermost pins and the edge, so a marker is never half-cropped. */
const PADDING = 28

export interface TilePlacement {
  /** `{#each}` key: the unwrapped column, so two columns that wrap onto the same tile differ. */
  key: string
  /** Offset within the viewport, in CSS pixels. */
  left: number
  top: number
  /** Tile coordinates for the URL. */
  x: number
  y: number
}

export interface TileView {
  /** World pixel of the viewport's top-left. Subtract it from a point's world pixel to place it. */
  origin: { x: number; y: number }
  tiles: TilePlacement[]
  zoom: number
}

/** The Web Mercator world pixel of a coordinate at `zoom`. */
export const worldPx = ({ lat, long }: Coords, zoom: number): { x: number; y: number } => {
  const scale = 2 ** zoom * TILE_SIZE
  const sin = Math.sin((lat * Math.PI) / 180)

  return {
    x: ((long + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

/** The largest zoom at which every point fits a `width` x `height` box, padding included. */
export const fitZoom = (points: readonly Coords[], width: number, height: number): number => {
  if (points.length < 2) {
    return POINT_ZOOM
  }

  for (let zoom = MAX_ZOOM; zoom > 1; zoom--) {
    const pixels = points.map((point) => worldPx(point, zoom))
    const spanX = Math.max(...pixels.map((p) => p.x)) - Math.min(...pixels.map((p) => p.x))
    const spanY = Math.max(...pixels.map((p) => p.y)) - Math.min(...pixels.map((p) => p.y))

    if (spanX <= width - PADDING * 2 && spanY <= height - PADDING * 2) {
      return zoom
    }
  }

  return 1
}

/** The tiles a `width` x `height` thumbnail centred on `points` needs, and where to put them. */
export const tileView = (points: readonly Coords[], width: number, height: number): TileView => {
  const zoom = fitZoom(points, width, height)
  const pixels = points.map((point) => worldPx(point, zoom))
  const span = 2 ** zoom

  // Centre on the midpoint of the pins' bounding box, in pixel space rather than in degrees:
  // the two agree at these distances, but only one of them is the thing being laid out.
  const origin = {
    x: (Math.min(...pixels.map((p) => p.x)) + Math.max(...pixels.map((p) => p.x))) / 2 - width / 2,
    y: (Math.min(...pixels.map((p) => p.y)) + Math.max(...pixels.map((p) => p.y))) / 2 - height / 2,
  }

  const tiles: TilePlacement[] = []
  for (let x = Math.floor(origin.x / TILE_SIZE); x <= Math.floor((origin.x + width - 1) / TILE_SIZE); x++) {
    for (let y = Math.floor(origin.y / TILE_SIZE); y <= Math.floor((origin.y + height - 1) / TILE_SIZE); y++) {
      // No imagery above or below the Mercator limit, so those rows are left blank rather
      // than requested as 404s. Columns instead wrap, which is what the antimeridian does.
      if (y >= 0 && y < span) {
        tiles.push({
          key: `${x},${y}`,
          left: x * TILE_SIZE - origin.x,
          top: y * TILE_SIZE - origin.y,
          x: ((x % span) + span) % span,
          y,
        })
      }
    }
  }

  return { origin, tiles, zoom }
}

/** Where a point sits inside the viewport, in CSS pixels from its top-left. */
export const pointPx = (point: Coords, view: TileView): { left: number; top: number } => {
  const { x, y } = worldPx(point, view.zoom)
  return { left: x - view.origin.x, top: y - view.origin.y }
}
