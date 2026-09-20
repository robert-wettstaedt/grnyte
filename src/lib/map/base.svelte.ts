/**
 * The OpenLayers instance every map in the app is built on. Owns tiles, controls, view defaults,
 * the resize latch and teardown; clicks, overlays, geolocation and fitting stay with the caller.
 *
 * `Map.svelte` and `ReorderMap.svelte` are the two adapters. `StaticMap.svelte` is deliberately not
 * a client: it draws raw `<img>` tiles, because a feed of five cards would be five canvases.
 */
// The stylesheet is part of the instance. A caller that forgot it gets misplaced overlays, no error.
import 'ol/ol.css'
import { defaults as defaultControls } from 'ol/control.js'
import { defaults as defaultInteractions } from 'ol/interaction.js'
import { Tile as TileLayer } from 'ol/layer.js'
import type BaseLayer from 'ol/layer/Base.js'
import OlMap from 'ol/Map.js'
import { fromLonLat } from 'ol/proj.js'
import OSM from 'ol/source/OSM'
import View from 'ol/View.js'
import { OSM_LAYER_KEY } from './types'

/** Middle of the app's western-European range, so an empty map opens somewhere plausible. */
const DEFAULT_CENTER = [2.6117597, 48.4103865]
const DEFAULT_ZOOM = 4

export interface BaseMap {
  /** Detach and dispose. Call it from the attachment's cleanup, after the caller's own teardown. */
  destroy: () => void
  /** False until the element has a non-zero size. Fitting before then lands on a nonsense zoom. */
  readonly hasSize: boolean
  readonly map: OlMap
}

export interface BaseMapOptions {
  /** Drawn above the OSM base layer, in order. The region's WMS overlays, in practice. */
  extraLayers?: BaseLayer[]
  /** False strips pan and zoom entirely, for a thumbnail whose view is driven only by its props. */
  interactive?: boolean
  /** Seeds the view, for a map being rebuilt. `center` is in the view's projection as
   *  `View#getCenter` returns it, NOT lon/lat like `DEFAULT_CENTER` above. */
  view?: { center: number[]; zoom: number }
}

/** Build the base map on `node`. */
export function createBaseMap(node: HTMLElement, options: BaseMapOptions = {}): BaseMap {
  const { extraLayers = [], interactive = true, view } = options

  let hasSize = $state(false)

  const map = new OlMap({
    // No OL controls: zoom, geolocation, layers and attribution are Svelte buttons in the callers.
    // `attribution: false` is the second lock against admin-written credits reaching OL's innerHTML
    // (`createWmsLayers` no longer passes them). The callers render the credits themselves.
    controls: defaultControls({ attribution: false, rotate: false, zoom: false }),
    interactions: interactive ? defaultInteractions() : [],
    layers: [
      // All three settings are load bearing for offline (`base.svelte.test.ts` pins them):
      // `crossOrigin` so `src/sw.ts` can cache the tile, `preload` so a gap has a coarser parent
      // already in memory to stretch, `className` so `app.css` can style a tile-less map.
      new TileLayer({
        className: 'osm-layer',
        preload: 2,
        properties: { layerKey: OSM_LAYER_KEY, layerName: 'OpenStreetMap' },
        source: new OSM({ crossOrigin: 'anonymous' }),
      }),
      ...extraLayers,
    ],
    target: node,
    view: new View({
      center: view?.center ?? fromLonLat(DEFAULT_CENTER),
      constrainResolution: true,
      // North is always up: nothing offers to straighten a rotated map, and approaches assume north.
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
