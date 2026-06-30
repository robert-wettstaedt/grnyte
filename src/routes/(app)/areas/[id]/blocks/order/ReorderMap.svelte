<script lang="ts">
  import type { BlockDetail } from '$lib/entities/block/dto'
  import type { Coords } from '$lib/map/map'
  import { defaults as defaultControls } from 'ol/control.js'
  import { boundingExtent } from 'ol/extent'
  import { Tile as TileLayer } from 'ol/layer.js'
  import OlMap from 'ol/Map.js'
  import 'ol/ol.css'
  import Overlay from 'ol/Overlay.js'
  import { fromLonLat } from 'ol/proj.js'
  import OSM from 'ol/source/OSM'
  import View from 'ol/View.js'
  import type { Attachment } from 'svelte/attachments'

  interface Props {
    /** Blocks in their staged order — a pin's number is the block's 1-based list position. */
    blocks: BlockDetail[]
    /** Reference point for "sort by distance" (parking or centroid), shown as a `P` pin. */
    parking: Coords | null
    /** Highlighted block (two-way with the list). */
    selectedId?: number
    onselect?: (id: number) => void
  }

  const { blocks, parking, selectedId, onselect }: Props = $props()

  let map = $state<OlMap>()
  let hasSize = $state(false)

  // Imperative OL state — deliberately non-reactive lookups; reactivity comes from `blocks` /
  // `selectedId` reads in the effects below, not from these registries.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- OL overlay element registry, not UI state
  const pinEls = new Map<number, HTMLButtonElement>()
  let parkingOverlay: Overlay | undefined
  let fitted = false

  const mapAttachment: Attachment = (node) => {
    const instance = new OlMap({
      controls: defaultControls({ attribution: false, zoom: false, rotate: false }),
      target: node as HTMLElement,
      layers: [new TileLayer({ source: new OSM(), className: 'osm-layer' })],
      view: new View({ center: fromLonLat([2.6, 48.4]), zoom: 4, constrainResolution: true }),
    })
    map = instance

    const observer = new ResizeObserver(() => {
      instance.updateSize()
      const size = instance.getSize()
      if (!hasSize && size != null && size[0] > 0 && size[1] > 0) hasSize = true
    })
    observer.observe(node as HTMLElement)

    return () => {
      observer.disconnect()
      instance.setTarget(undefined)
      instance.dispose()
      map = undefined
    }
  }

  // Create a badge per located block (once), then keep every badge's number in sync with its
  // position in `blocks`. Positions are fixed (geolocation); only the label and highlight change.
  $effect(() => {
    const instance = map
    if (instance == null) return

    blocks.forEach((block, index) => {
      if (block.geolocation == null) return

      let el = pinEls.get(block.id)
      if (el == null) {
        el = document.createElement('button')
        el.type = 'button'
        el.className = 'reorder-pin'
        el.addEventListener('click', () => onselect?.(block.id))
        instance.addOverlay(
          new Overlay({
            element: el,
            positioning: 'center-center',
            stopEvent: true,
            position: fromLonLat([block.geolocation.long, block.geolocation.lat]),
          }),
        )
        pinEls.set(block.id, el)
      }

      const isSelected = block.id === selectedId
      el.textContent = String(index + 1)
      el.classList.toggle('selected', isSelected)
      // OL wraps each overlay in its own positioned container and stacks those wrappers by DOM
      // order, so a z-index on the pin itself can't win. Raise the wrapper's z-index to lift the
      // selected pin above any overlapping neighbours.
      if (el.parentElement != null) el.parentElement.style.zIndex = isSelected ? '500' : ''
    })
  })

  // Parking reference pin.
  $effect(() => {
    const instance = map
    if (instance == null || parking == null) return

    const position = fromLonLat([parking.long, parking.lat])
    if (parkingOverlay == null) {
      const el = document.createElement('div')
      el.className = 'reorder-parking'
      el.textContent = 'P'
      parkingOverlay = new Overlay({ element: el, positioning: 'center-center', position })
      instance.addOverlay(parkingOverlay)
    } else {
      parkingOverlay.setPosition(position)
    }
  })

  // One-time fit to the located blocks + parking, once the map has a size AND the blocks have
  // loaded — fitting on the parking pin alone would zoom right past them.
  $effect(() => {
    const instance = map
    if (instance == null || !hasSize || fitted) return

    const located = blocks.filter((block) => block.geolocation != null)
    if (located.length === 0) return

    const coords = located.map((block) => fromLonLat([block.geolocation!.long, block.geolocation!.lat]))
    if (parking != null) coords.push(fromLonLat([parking.long, parking.lat]))

    fitted = true
    if (coords.length === 1) {
      instance.getView().setCenter(coords[0])
      instance.getView().setZoom(16)
    } else {
      instance.getView().fit(boundingExtent(coords), { padding: [48, 48, 48, 48], maxZoom: 17 })
    }
  })
</script>

<div class="map h-full w-full" {@attach mapAttachment}></div>

<style>
  /* Quiet dark map: only the OSM raster is inverted, like the main map. */
  :global(.dark) .map :global(.osm-layer) {
    filter: invert(1) hue-rotate(180deg) saturate(0.4) brightness(0.9) contrast(0.95);
  }

  /* Numbered block pins + parking marker live in OL's overlay container (outside this
     component's DOM), so they have to be styled globally. */
  :global(.reorder-pin) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 9999px;
    border: 2px solid white;
    background: var(--color-primary-500);
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
    background: var(--color-secondary-500);
    transform: scale(1.25);
  }

  :global(.reorder-parking) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    border: 2px solid white;
    background: var(--color-surface-700);
    color: white;
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
  }
</style>
