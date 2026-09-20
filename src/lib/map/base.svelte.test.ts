/**
 * The base map's configuration: the settings other systems depend on and no compiler checks.
 * Not a rendering test, jsdom has no canvas. Two tests act before reading, because a resting value
 * (rotation 0, an unlatched size) is the same with the guard deleted.
 */
import type { MapLayer } from '$lib/entities/region/settings'
import TileLayer from 'ol/layer/Tile.js'
import type OSM from 'ol/source/OSM'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createBaseMap } from './base.svelte'
import { buildLayerEntries, createWmsLayers } from './layers.svelte'
import { MARKERS_LAYER_KEY, OSM_LAYER_KEY } from './types'

/** Every observer the stub below handed out, newest last, so a test can fire or inspect one. */
const observers: { callback: ResizeObserverCallback; disconnected: boolean }[] = []

beforeAll(() => {
  // jsdom ships no `ResizeObserver`. Installed unconditionally, because two tests fire the
  // callback and check the disconnect.
  globalThis.ResizeObserver = class {
    #entry: (typeof observers)[number]

    constructor(callback: ResizeObserverCallback) {
      this.#entry = { callback, disconnected: false }
      observers.push(this.#entry)
    }

    disconnect() {
      this.#entry.disconnected = true
    }

    observe() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  observers.length = 0
})

/** The observer `createBaseMap` registered, which is the last one: OL builds its own inside the
 *  `Map` constructor, and the factory's comes after it. */
const ownObserver = () => observers.at(-1)!

/** Run `fn` against a live base map, inside an effect root. `fn` asserts in here rather than
 *  returning OL objects: the map is disposed on the way out. */
function withBaseMap(fn: (base: ReturnType<typeof createBaseMap>, node: HTMLElement) => void): void {
  const node = document.createElement('div')
  document.body.append(node)

  const cleanup = $effect.root(() => {
    const base = createBaseMap(node)
    fn(base, node)
    base.destroy()
  })

  cleanup()
  node.remove()
}

describe('createBaseMap', () => {
  it('builds with no OpenLayers controls, the attribution one included', () => {
    // The attribution control is the one that matters: OL renders attributions into `innerHTML`.
    withBaseMap((base) => {
      expect(
        base.map
          .getControls()
          .getArray()
          .map((control) => control.constructor.name),
      ).toEqual([])
    })
  })

  it('keeps the three OSM tile settings the service worker and offline mode depend on', () => {
    // `className` styles a tile-less map, `crossOrigin` lets `src/sw.ts` cache a tile, `preload`
    // leaves a coarser parent to stretch over a gap. All three only show up offline at a crag.
    withBaseMap((base) => {
      const layer = base.map.getLayers().getArray()[0]
      expect(layer).toBeInstanceOf(TileLayer)

      const tile = layer as TileLayer<OSM>
      expect(tile.getClassName()).toBe('osm-layer')
      expect(tile.getPreload()).toBe(2)
      // Past OL's `protected`: no public read exists. A rename fails loudly, which is the right
      // way round here.
      expect((tile.getSource() as unknown as null | { crossOrigin?: string })?.crossOrigin).toBe('anonymous')
    })
  })

  it('refuses to rotate, so north stays up', () => {
    // Asked to rotate, because a fresh `View` reports 0 either way: asserting the resting value
    // stayed green with `enableRotation: false` deleted.
    withBaseMap((base) => {
      const view = base.map.getView()
      view.setRotation(Math.PI / 4)
      expect(view.getRotation()).toBe(0)

      // Unlike rotation, this one discriminates on its own: OL's default is false.
      expect(view.getConstrainResolution()).toBe(true)
    })
  })

  it('latches size only once the element reports a real one', () => {
    // Fires the observer rather than asserting the resting `false`, which an unconditional
    // `hasSize = true` also passes. A latch stuck true makes every caller fit a zero viewport.
    withBaseMap((base) => {
      const fire = ownObserver().callback
      const reports = (value: number[] | undefined) => {
        ;(base.map as unknown as { getSize: () => number[] | undefined }).getSize = () => value
      }

      expect(base.hasSize).toBe(false)

      reports(undefined)
      fire([], {} as ResizeObserver)
      expect(base.hasSize).toBe(false)

      // Laid out, but to nothing: what an element in a collapsed container reports.
      reports([0, 0])
      fire([], {} as ResizeObserver)
      expect(base.hasSize).toBe(false)

      reports([800, 600])
      fire([], {} as ResizeObserver)
      expect(base.hasSize).toBe(true)
    })
  })

  it('detaches and stops observing on destroy', () => {
    // Both halves: a live target keeps the element, a live observer keeps calling `updateSize`
    // on a disposed map. Asserting only the target left `observer.disconnect()` deletable.
    const node = document.createElement('div')
    document.body.append(node)

    const cleanup = $effect.root(() => {
      const base = createBaseMap(node)
      const own = ownObserver()

      expect(base.map.getTarget()).toBe(node)
      expect(own.disconnected).toBe(false)

      base.destroy()

      // `null`, not `undefined`: OL normalises a cleared target through its property store.
      expect(base.map.getTarget() ?? null).toBeNull()
      expect(own.disconnected).toBe(true)
    })

    cleanup()
    node.remove()
  })
})

/** A membership carrying just the layers a test cares about. */
const region = (...mapLayers: MapLayer[]) =>
  ({ regionFk: 1, settings: { mapLayers, tags: [] } }) as unknown as Parameters<typeof createWmsLayers>[0][number]

const LAYER: MapLayer = {
  attributions: null,
  minZoom: null,
  name: 'Relief',
  opacity: null,
  params: { LAYERS: 'relief' },
  type: 'wms',
  url: 'https://example.invalid/wms',
}

describe('createWmsLayers', () => {
  it("builds one tile layer for an overlay two of the user's regions both store", () => {
    // Two would mean twice the tile requests and, on a translucent overlay, a compounded opacity.
    const layers = createWmsLayers([region(LAYER), region({ ...LAYER, name: 'Schummerung', opacity: 0.4 })])

    expect(layers).toHaveLength(1)
    expect(layers[0].get('layerName')).toBe('Relief / Schummerung')
    expect(layers[0].getOpacity()).toBe(1)
  })

  it('gives each distinct overlay its own toggle key', () => {
    const layers = createWmsLayers([region(LAYER, { ...LAYER, name: 'Hillshade', params: { LAYERS: 'hillshade' } })])

    expect(new Set(layers.map((layer) => layer.get('layerKey') as string)).size).toBe(2)
  })

  it('never hands a region layer its attributions', () => {
    // Credits are admin-written and OL renders them as HTML. Restoring `attributions` here is a
    // cross-region XSS; the credits sheet parses them through `./attribution` instead.
    const credited = { ...LAYER, attributions: ['<img src=x onerror="alert(1)">'] }
    // Merged too, since merging is what fills `attributions` on a layer neither region credited.
    const layers = createWmsLayers([region(credited), region({ ...credited, name: 'Schummerung' })])

    expect(layers).toHaveLength(1)
    expect(layers[0].getSource()?.getAttributions()).toBeNull()
  })
})

describe('buildLayerEntries', () => {
  it('shows the marker group as one row and each overlay as its own', () => {
    const markers = [new TileLayer({ properties: { layerKey: MARKERS_LAYER_KEY, layerName: 'Markers' } })]
    const overlays = createWmsLayers([region(LAYER, { ...LAYER, name: 'Relief', params: { LAYERS: 'hillshade' } })])
    const osm = new TileLayer({ properties: { layerKey: OSM_LAYER_KEY, layerName: 'OpenStreetMap' } })

    const entries = buildLayerEntries([osm, ...overlays, ...markers, ...markers])

    // Two rows both labelled "Relief": they are different overlays, and collapsing them by label
    // would leave one of them drawing with no way to turn it off.
    expect(entries.map((entry) => entry.label)).toEqual(['OpenStreetMap', 'Relief', 'Relief', 'Markers'])
    expect(entries.map((entry) => entry.icon)).toEqual(['map', 'layers', 'layers', 'map-pin'])
  })

  it('skips a layer with no toggle key, such as the vector layers OL adds itself', () => {
    expect(buildLayerEntries([new TileLayer({})])).toEqual([])
  })
})
