/**
 * The OpenLayers instance every map in the app is built on.
 *
 * There are two adapters over OL: `Map.svelte`, which is the guidebook map, and `ReorderMap.svelte`,
 * which draws numbered pins for the block reorder screen. They want different behaviour (one
 * navigates on a tap, the other drags positions around) but the same map underneath, and before
 * this module they each built that map themselves. The copies had already drifted: two different
 * default centres, and an auto-fit rule improved in one file and not the other.
 *
 * So this owns the instance and nothing else. Tiles, controls, the view defaults, the resize latch
 * and teardown live here; clicks, overlays, geolocation and fitting stay with the caller, because
 * those are the parts that genuinely differ. It is the same split `layers.svelte.ts` already makes
 * for features and layers, which has worked: `ReorderMap` shares those helpers happily.
 *
 * `StaticMap.svelte` is deliberately not a client of this. It draws raw `<img>` tiles and has no OL
 * instance at all, because a feed of five cards would otherwise mean five canvases.
 */
// Imported here rather than by each caller: the stylesheet is part of the instance this module
// owns. `ReorderMap`'s numbered pins are OL `Overlay`s whose positioning comes from it, so a caller
// that forgot the import would get subtly misplaced overlays rather than an error.
import 'ol/ol.css'
import { defaults as defaultControls } from 'ol/control.js'
import { defaults as defaultInteractions } from 'ol/interaction.js'
import { Tile as TileLayer } from 'ol/layer.js'
import type BaseLayer from 'ol/layer/Base.js'
import OlMap from 'ol/Map.js'
import { fromLonLat } from 'ol/proj.js'
import OSM from 'ol/source/OSM'
import View from 'ol/View.js'

/** Roughly the middle of the app's western-European range, so a map with nothing to show yet opens
 *  somewhere plausible rather than in the Atlantic. Both adapters had their own rounding of this. */
const DEFAULT_CENTER = [2.6117597, 48.4103865]
const DEFAULT_ZOOM = 4

export interface BaseMap {
  /** Detach and dispose. Call it from the attachment's cleanup, after the caller's own teardown. */
  destroy: () => void
  /** False until the element has been laid out with a non-zero size. Fitting a view to an extent
   *  before then computes against a zero viewport and lands on a nonsense zoom, so every caller
   *  that fits has to wait for this. */
  readonly hasSize: boolean
  readonly map: OlMap
}

export interface BaseMapOptions {
  /** Drawn above the OSM base layer, in order. The region's WMS overlays, in practice. */
  extraLayers?: BaseLayer[]
  /** False strips pan and zoom entirely, for a thumbnail whose view is driven only by its props. */
  interactive?: boolean
  /**
   * Seeds the view, for a map being rebuilt that should not snap back to the world view.
   *
   * `center` is in the view's projection, as `View#getCenter` returns it, and is NOT lon/lat. The
   * one caller passing it reads it straight back off `getCenter`. Worth saying because
   * `DEFAULT_CENTER` a dozen lines up IS lon/lat and goes through `fromLonLat`, so the natural
   * misreading puts the map in the Gulf of Guinea with no error and no type complaint.
   */
  view?: { center: number[]; zoom: number }
}

/**
 * Build the base map on `node`.
 *
 * Returns rather than accepting a callback because both callers already own an attachment and want
 * the instance synchronously to hang their own listeners on.
 */
export function createBaseMap(node: HTMLElement, options: BaseMapOptions = {}): BaseMap {
  const { extraLayers = [], interactive = true, view } = options

  let hasSize = $state(false)

  const map = new OlMap({
    // No OL controls at all. Zoom, geolocation, layers and attribution are Svelte buttons in the
    // callers, so each one is a real Skeleton button instead of a foreign widget restyled to
    // resemble one.
    //
    // `attribution: false` is not only cosmetic, and what it guards has changed. OL renders a
    // source's `attributions` straight into `innerHTML`, and region map layers carry credits written
    // by a region admin, so this used to be the only thing standing between that and an XSS against
    // everyone in the region. `createWmsLayers` no longer hands them over, so it is now the second
    // lock on that door.
    //
    // The failure direction flipped with it, which is easy to lose because it is no longer a
    // security question: re-enabling this control would now credit NOTHING for the region layers
    // rather than too much, and those credits are a licence obligation. OSM's own credit is rendered
    // separately in the callers, so it survives either way.
    controls: defaultControls({ attribution: false, rotate: false, zoom: false }),
    interactions: interactive ? defaultInteractions() : [],
    layers: [
      // `crossOrigin` is OpenLayers' own default, spelled out because `src/sw.ts` depends on it: an
      // opaque tile response cannot be checked or measured, so the worker declines to cache it and
      // the map quietly stops working offline. See `isStorableTile` in `./tiles`.
      //
      // `preload` is what gives a missing tile something to fall back to. The renderer will stretch
      // a coarser parent over a tile it does not have, but only one already in memory: it never
      // fetches a parent to cover a gap (`findAltTiles_` peeks at the tile cache and nothing more).
      // So the parents have to be asked for while there is a network, which is exactly what this
      // does, one level at a time down from the view. Two levels is roughly half again as many tile
      // requests, all cached by the worker like any other, and offline it turns a hole in the map
      // into a blurry-but-oriented patch.
      //
      // What a tile-less map looks like is handled in `app.css` rather than by OL's `background`
      // option, which sets an inline colour that CSS cannot theme. Those rules key on `osm-layer`,
      // so this class name is load bearing beyond being a selector hook.
      new TileLayer({
        className: 'osm-layer',
        preload: 2,
        properties: { layerName: 'OpenStreetMap' },
        source: new OSM({ crossOrigin: 'anonymous' }),
      }),
      ...extraLayers,
    ],
    target: node,
    view: new View({
      center: view?.center ?? fromLonLat(DEFAULT_CENTER),
      constrainResolution: true,
      // North is always up. Nothing offers to straighten a rotated map (the reset-north control is
      // off), and an approach description assumes north.
      enableRotation: false,
      zoom: view?.zoom ?? DEFAULT_ZOOM,
    }),
  })

  const observer = new ResizeObserver(() => {
    map.updateSize()
    const size = map.getSize()
    if (!hasSize && size != null && size[0] > 0 && size[1] > 0) {
      hasSize = true
    }
  })
  observer.observe(node)

  return {
    destroy: () => {
      observer.disconnect()
      map.setTarget(undefined)
      map.dispose()
    },
    get hasSize() {
      return hasSize
    },
    map,
  }
}
