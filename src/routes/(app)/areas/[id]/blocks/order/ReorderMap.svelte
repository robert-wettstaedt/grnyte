<script lang="ts">
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { createBaseMap } from '$lib/map/base.svelte'
  import { buildParkingFeatures, buildPathFeatures, createParkingLayer, createPathLayer } from '$lib/map/layers.svelte'
  import type { Coords } from '$lib/map/map'
  import MapCredit from '$lib/map/MapCredit.svelte'
  import { boundingExtent } from 'ol/extent'
  import type OlMap from 'ol/Map.js'
  import Overlay from 'ol/Overlay.js'
  import { fromLonLat } from 'ol/proj.js'
  import type { Attachment } from 'svelte/attachments'

  interface Props {
    /** Blocks in their staged order: a pin's number is the block's 1-based list position. */
    blocks: BlockDetail[]
    /** Encoded approach polylines (the area's walking paths), drawn like the main map. */
    geoPaths?: string[]
    onselect?: (id: number) => void
    /** Reference point for "sort by distance" (parking or centroid), shown as a parking pin. */
    parking: Coords | null
    /** Highlighted block (two-way with the list). */
    selectedId?: number
  }

  const { blocks, geoPaths, onselect, parking, selectedId }: Props = $props()

  // What OL's KeyboardPan and KeyboardZoom act on, and so what counts as the reader taking over.

  const PAN_KEYS = new Set(['+', '-', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'])

  let map = $state<OlMap>()
  // Held so the fit effect can read `hasSize`, which the base map owns: fitting to an extent before
  // the element has a size computes against a zero viewport and lands on a nonsense zoom.
  let baseMap = $state<ReturnType<typeof createBaseMap>>()

  // Imperative OL state: deliberately non-reactive lookups; reactivity comes from `blocks` /
  // `selectedId` reads in the effects below, not from these registries.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- OL overlay registry, not UI state
  const pins = new Map<number, { el: HTMLButtonElement; overlay: Overlay }>()
  // What the last fit framed, and whether the reader has taken the view over. Zero reports a query
  // ready on a partial snapshot, so the first arrivals are routinely a subset: re-fitting as the
  // set grows is what keeps the rest from streaming in off-screen. Waiting for a completion signal
  // instead would leave the map unframed for as long as blocks keep arriving, which is the whole
  // window a reader spends here. Parking counts
  // towards the signature: it lands on its own related query, so tracking the block count alone
  // left the `P` pin, which is the whole reference for "sort by distance", outside the viewport.
  let fitted = ''
  let userMoved = false

  const mapAttachment: Attachment = (node) => {
    const base = createBaseMap(node as HTMLElement)
    const instance = base.map
    map = instance
    baseMap = base

    // Any deliberate pan or zoom retires the auto-fit, so it cannot yank the view back. Tapping a
    // pin is not one: `stopEvent` only keeps OL from panning, the DOM event still arrives here, so
    // highlighting a block mid-sync used to strand every later one off-screen.
    const takeOver = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.reorder-pin') != null) return
      userMoved = true
    }
    // OL's own KeyboardPan and KeyboardZoom, which listen on the target element rather than the
    // viewport. OL will not pan until the map itself can hold focus, which no map here does, but
    // the pins are focusable buttons INSIDE this element: arrowing between them bubbles up here,
    // and without the same guard the pointer path has, moving between pins retired the fit while
    // the view never moved, stranding every block that synced in afterwards.
    const takeOverKey = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('.reorder-pin') != null) return
      if (PAN_KEYS.has(event.key)) userMoved = true
    }
    const element = node as HTMLElement
    const viewport = instance.getViewport()
    viewport.addEventListener('pointerdown', takeOver)
    viewport.addEventListener('wheel', takeOver, { passive: true })
    element.addEventListener('keydown', takeOverKey)

    return () => {
      viewport.removeEventListener('pointerdown', takeOver)
      viewport.removeEventListener('wheel', takeOver)
      element.removeEventListener('keydown', takeOverKey)
      base.destroy()
      map = undefined
      baseMap = undefined
    }
  }

  // One badge per located block, added and removed as `blocks` changes, with every badge's number
  // kept in sync with its position. Positions are fixed (geolocation); label and highlight change.
  $effect(() => {
    const instance = map
    if (instance == null) return

    blocks.forEach((block, index) => {
      if (block.geolocation == null) return

      let el = pins.get(block.id)?.el
      if (el == null) {
        el = document.createElement('button')
        el.type = 'button'
        el.className = 'reorder-pin'
        el.addEventListener('click', () => onselect?.(block.id))
        const overlay = new Overlay({
          element: el,
          position: fromLonLat([block.geolocation.long, block.geolocation.lat]),
          positioning: 'center-center',
          stopEvent: true,
        })
        instance.addOverlay(overlay)
        pins.set(block.id, { el, overlay })
      }

      const isSelected = block.id === selectedId
      el.textContent = String(index + 1)
      el.classList.toggle('selected', isSelected)
      // OL wraps each overlay in its own positioned container and stacks those wrappers by DOM
      // order, so a z-index on the pin itself can't win. Raise the wrapper's z-index to lift the
      // selected pin above any overlapping neighbours.
      if (el.parentElement != null) el.parentElement.style.zIndex = isSelected ? '500' : ''
    })

    // Drop badges for blocks that have left. The page hands over the previous area's list for the
    // render before its own clear lands, and a block can be deleted while this is open.
    const present = new Set(blocks.map((block) => block.id))
    for (const [id, pin] of pins) {
      if (!present.has(id)) {
        instance.removeOverlay(pin.overlay)
        pins.delete(id)
      }
    }
  })

  // Parking + approach paths, drawn through the main map's own layer/feature helpers so the two
  // maps stay identical. `minZoom: 0` keeps them visible on this single-area view at any zoom.
  $effect(() => {
    const instance = map
    if (instance == null) return

    const parkingLayer = createParkingLayer(0)
    if (parking != null) parkingLayer.getSource()?.addFeatures(buildParkingFeatures([parking]))

    const pathLayer = createPathLayer(0)
    pathLayer.getSource()?.addFeatures(buildPathFeatures(geoPaths ?? []))

    instance.addLayer(parkingLayer)
    instance.addLayer(pathLayer)
    return () => {
      instance.removeLayer(parkingLayer)
      instance.removeLayer(pathLayer)
    }
  })

  // Fit to the located blocks + parking, again whenever the set grows, until the reader moves.
  $effect(() => {
    const instance = map
    if (instance == null || baseMap?.hasSize !== true || userMoved) return

    const located = blocks.filter((block) => block.geolocation != null)
    // Content, not a count: a block leaving as another arrives keeps the count at three and the
    // map never refits. Sorted, because `blocks` arrives in the reader's order and a drag must
    // not refit the map under them: what to fit is a set, not a sequence.
    const signature = located
      .map((block) => `${block.id}@${block.geolocation!.lat},${block.geolocation!.long}`)
      .sort()
      .join('|')
      .concat(parking == null ? '' : `|P@${parking.lat},${parking.long}`)
    if (located.length === 0 || signature === fitted) return

    const coords = located.map((block) => fromLonLat([block.geolocation!.long, block.geolocation!.lat]))
    if (parking != null) coords.push(fromLonLat([parking.long, parking.lat]))

    fitted = signature
    if (coords.length === 1) {
      instance.getView().setCenter(coords[0])
      instance.getView().setZoom(16)
    } else {
      instance.getView().fit(boundingExtent(coords), { maxZoom: 17, padding: [48, 48, 48, 48] })
    }
  })
</script>

<div class="relative h-full w-full">
  <div class="map h-full w-full" {@attach mapAttachment}></div>

  <MapCredit />
</div>

<style>
  /* Numbered block pins live in OL's overlay container (outside this component's DOM),
     so they have to be styled globally. */
  :global(.reorder-pin) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 9999px;
    border: 2px solid white;
    /* #ef4444 = the main map's block red; selected goes primary, also like the main map. */
    background: #ef4444;
    color: white;
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
    transition:
      transform 0.12s ease,
      background-color 0.12s ease;
  }

  :global(.reorder-pin.selected) {
    background: var(--color-primary-500);
    transform: scale(1.25);
  }
</style>
