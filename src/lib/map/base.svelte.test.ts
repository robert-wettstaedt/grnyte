/**
 * The base map's configuration, which is the part that drifted.
 *
 * Not a rendering test: OpenLayers needs a real canvas and jsdom has none, so nothing here asserts
 * that a tile appears. What it does assert is the handful of settings that other systems depend on
 * and that no compiler checks, each of which was previously held by a comment in two files that had
 * already diverged.
 *
 * Two of these ask the module to do something before reading the result, for the same reason: a
 * fresh `View` reports rotation 0 whether or not rotation is locked, and a size latch reports false
 * whether or not its guard works. Asserting the resting value would name a setting while pinning
 * nothing, which is what the first version of this file did.
 */
import TileLayer from 'ol/layer/Tile.js'
import type OSM from 'ol/source/OSM'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createBaseMap } from './base.svelte'
import { createWmsLayers } from './layers.svelte'

/** Every observer the stub below handed out, newest last, so a test can fire or inspect one. */
const observers: { callback: ResizeObserverCallback; disconnected: boolean }[] = []

beforeAll(() => {
  // jsdom ships no `ResizeObserver`, and OpenLayers constructs one of its own before this module
  // gets to. Installed unconditionally rather than only when missing, because two tests below need
  // to fire the callback and see the disconnect rather than let it sit there.
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

/**
 * Run `fn` against a live base map, inside an effect root so its `$state` has somewhere to live.
 *
 * `fn` asserts in here rather than returning OL objects to be read afterwards: the map is disposed
 * on the way out, and reading a view or a layer past that only works because `Map#dispose` happens
 * not to dispose either. Every future test in this file would have inherited that assumption.
 */
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
    // The attribution control is the one that matters: OL renders a source's attributions straight
    // into `innerHTML`. `createWmsLayers` no longer hands it any, so this is the second lock rather
    // than the only one.
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
    // `className` is what `app.css` styles a tile-less map through, `crossOrigin` is what lets
    // `src/sw.ts` cache a tile at all (an opaque response cannot be measured), and `preload` is what
    // leaves a coarser parent in memory to stretch over a missing tile. All three are invisible
    // until someone is offline at a crag, which is the worst place to find out.
    withBaseMap((base) => {
      const layer = base.map.getLayers().getArray()[0]
      expect(layer).toBeInstanceOf(TileLayer)

      const tile = layer as TileLayer<OSM>
      expect(tile.getClassName()).toBe('osm-layer')
      expect(tile.getPreload()).toBe(2)
      // Reached past OL's `protected`, deliberately: it exposes no public read for this, and of the
      // three settings it is the one whose loss is invisible until somebody is offline. If OL ever
      // renames the field this fails loudly rather than passing quietly, which is the right way
      // round for a test guarding something nobody sees.
      expect((tile.getSource() as unknown as null | { crossOrigin?: string })?.crossOrigin).toBe('anonymous')
    })
  })

  it('refuses to rotate, so north stays up', () => {
    // Asked to rotate, because a fresh `View` reports rotation 0 either way: OL defaults `rotation`
    // to 0 and `enableRotation` to true, so asserting the resting value stayed green with
    // `enableRotation: false` deleted. `setRotation` runs through the view's constraints, and
    // locking rotation installs the one that pins it at zero.
    //
    // What losing it costs: a reader two-finger-twists the map and has no way back. There is no
    // reset-north control, and every approach description assumes north.
    withBaseMap((base) => {
      const view = base.map.getView()
      view.setRotation(Math.PI / 4)
      expect(view.getRotation()).toBe(0)

      // Unlike rotation, this one discriminates on its own: OL's default is false.
      expect(view.getConstrainResolution()).toBe(true)
    })
  })

  it('latches size only once the element reports a real one', () => {
    // Fires the observer rather than asserting the resting `false`, which stayed green if the guard
    // were deleted or replaced with an unconditional `hasSize = true`. A latch stuck true is the
    // failure that matters: every caller that fits a view gates on this, and fitting against a zero
    // viewport lands on a nonsense zoom.
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
    // Both halves, because they leak differently: a live target keeps the element, and a live
    // observer keeps calling `updateSize` on a disposed map every time the layout changes.
    // Asserting only the target left `observer.disconnect()` deletable.
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

describe('createWmsLayers', () => {
  it('never hands a region layer its attributions', () => {
    // The credits are written by a region admin and rendered as HTML by OL. They reach the reader
    // through the credits sheet, which parses them (`./attribution`); they must not reach a source.
    // Deleting this assertion and restoring `attributions` is a cross-region XSS.
    const layers = createWmsLayers([
      {
        regionFk: 1,
        settings: {
          mapLayers: [
            {
              attributions: ['<img src=x onerror="alert(1)">'],
              minZoom: null,
              name: 'Relief',
              opacity: null,
              params: { LAYERS: 'relief' },
              type: 'wms',
              url: 'https://example.invalid/wms',
            },
          ],
          tags: [],
        },
      },
    ] as unknown as Parameters<typeof createWmsLayers>[0])

    expect(layers).toHaveLength(1)
    expect(layers[0].getSource()?.getAttributions()).toBeNull()
  })
})
