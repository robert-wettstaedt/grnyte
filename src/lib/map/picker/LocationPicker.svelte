<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { userLocation } from '$lib/map/geolocation.svelte'
  import { formatCoord } from '$lib/map/map'
  import Map from '$lib/map/Map.svelte'
  import type { Bounds, MapData, MapFocus } from '$lib/map/types'
  import { m } from '$lib/paraglide/messages'
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte'
  import { untrack } from 'svelte'

  interface Props {
    areaExtent: Bounds | null
    latText?: string
    lngText?: string
    mapData: MapData
    // Form state lifted to the parent so it survives the step-toggle remount.
    mode?: 'coordinates' | 'map'
    // Fires when the reader moves the pin or types a coordinate. `picked` cannot report that: it
    // mirrors the map centre, so it is set from the moment the picker frames itself.
    onedit?: () => void
    // Output: the location to save (map centre in map mode, the typed pair otherwise).
    picked?: null | { lat: number; long: number }
    // The parking committed when advancing to step 2; reframe back here on return.
    placedCenter: [number, number] | null
  }

  let {
    areaExtent,
    latText = $bindable(''),
    lngText = $bindable(''),
    mapData,
    mode = $bindable('map'),
    onedit,
    picked = $bindable(null),
    placedCenter,
  }: Props = $props()

  // Set once the map settles/pans (onviewchange); until then fall back to the framing centre.
  let pannedCenter = $state<[number, number] | null>(null)
  let pannedZoom = $state<null | number>(null)

  const focus = $derived<MapFocus | null>(areaExtent == null ? null : { extent: areaExtent })
  const center = $derived<[number, number] | null>(
    areaExtent == null ? null : [(areaExtent[0] + areaExtent[2]) / 2, (areaExtent[1] + areaExtent[3]) / 2],
  )
  const mapCenter = $derived<[number, number] | null>(pannedCenter ?? center)

  // Every reader gesture that moves the pin. The parent uses it for the leave confirm, the device
  // seed below to stop reframing a map somebody is aiming.
  let touched = $state(false)
  const edited = () => {
    touched = true
    onedit?.()
  }

  // With no area box and no placement there is nothing to frame, and the pin is the map centre, so
  // the default view would read as an answer. A first block is usually where the reader stands.
  const unframed = $derived(areaExtent == null && placedCenter == null)
  // Only when permission is already granted. Opening a picker must not raise a prompt of its own.
  let locationGranted = $state(false)
  $effect(() => {
    void navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((status) => (locationGranted = status.state === 'granted'))
      .catch(() => {})
  })
  // Latched, because the seed is a starting point and not a follow. Gated on the gesture flag,
  // never on `pannedCenter`, which OpenLayers sets a frame after mount.
  let deviceSeed = $state<[number, number] | null>(null)
  // Dropped once latched. Only the first fix is used, so the watch has nothing left to do.
  const device = userLocation(() => unframed && locationGranted && deviceSeed == null)

  // `userLocation().current` ignores its own `enabled` gate, so a value held at init came from an
  // earlier screen and would put the pin where the reader was. Only a later fix, a new object, counts.
  const staleFix = device.current
  $effect(() => {
    const here = device.current
    if (deviceSeed != null || touched || here == null || here === staleFix) return
    deviceSeed = [here.lat, here.long]
  })

  // A snapshot taken when the map goes away, never the live view. Feeding the live centre back as
  // `focus` makes the map its own input, and the lonLat round trip is not bit-exact.
  let restoreView = $state<MapFocus | null>(null)
  $effect(() => {
    if (mode === 'map') return
    restoreView = untrack(() =>
      touched && pannedCenter != null ? { center: pannedCenter, zoom: pannedZoom ?? 15 } : null,
    )
  })

  // Once the reader has aimed it, nothing below reframes: not the placement they are correcting,
  // and not a late `areaExtent`. This map has no camera claim, so a changed `focus` would otherwise
  // apply over them. Null while they hold it, so the snapshot above survives the remount.
  const placeFocus = $derived<MapFocus | null>(
    touched
      ? restoreView
      : placedCenter != null
        ? { center: placedCenter, zoom: 15 }
        : (focus ?? (deviceSeed == null ? null : { center: deviceSeed, zoom: 15 })),
  )

  const candidate = $derived.by<null | { lat: number; long: number }>(() => {
    if (mode === 'map') {
      return mapCenter == null ? null : { lat: mapCenter[0], long: mapCenter[1] }
    }
    if (latText.trim() === '' || lngText.trim() === '') return null
    const lat = Number(latText)
    const long = Number(lngText)
    if (!Number.isFinite(lat) || !Number.isFinite(long)) return null
    if (lat < -90 || lat > 90 || long < -180 || long > 180) return null
    return { lat, long }
  })
  // Lift the picked coordinate to the parent (Next button, hidden form inputs).
  $effect(() => {
    picked = candidate
  })

  // Let people paste a "lat, lng" pair (as copied from any maps app) into the latitude field.
  const onLatInput = (event: Event & { currentTarget: HTMLInputElement }) => {
    edited()
    const value = event.currentTarget.value
    const pair = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
    if (pair) {
      latText = pair[1]
      lngText = pair[2]
    } else {
      latText = value
    }
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <SegmentedControl class="m-3" value={mode} onValueChange={(details) => (mode = details.value as typeof mode)}>
    <SegmentedControl.Control class="w-full">
      <SegmentedControl.Indicator class="preset-filled-primary-500" />
      <SegmentedControl.Item value="map">
        <SegmentedControl.ItemText
          class="data-[state=checked]:text-primary-contrast-500 inline-flex items-center gap-2"
        >
          <Icon name="map-pin" size={17} />
          {m.parking_selectOnMap()}
        </SegmentedControl.ItemText>
        <SegmentedControl.ItemHiddenInput />
      </SegmentedControl.Item>
      <SegmentedControl.Item value="coordinates">
        <SegmentedControl.ItemText
          class="data-[state=checked]:text-primary-contrast-500 inline-flex items-center gap-2"
        >
          <Icon name="locate" size={17} />
          {m.parking_byCoordinates()}
        </SegmentedControl.ItemText>
        <SegmentedControl.ItemHiddenInput />
      </SegmentedControl.Item>
    </SegmentedControl.Control>
  </SegmentedControl>

  {#if mode === 'coordinates'}
    <div class="overflow-y-auto px-4 py-2">
      <div class="flex gap-3">
        <label class="min-w-0 flex-1 space-y-2">
          <span class="text-surface-600-400 text-[11px] font-bold tracking-wider uppercase">
            {m.parking_latitude()}
          </span>
          <input
            class="border-surface-300-700 bg-surface-100-900 focus:border-primary-500 w-full rounded-xl border px-4 py-3 font-mono text-base focus:ring-0 focus:outline-none"
            inputmode="decimal"
            oninput={onLatInput}
            placeholder="48.410244"
            type="text"
            value={latText}
          />
        </label>

        <label class="min-w-0 flex-1 space-y-2">
          <span class="text-surface-600-400 text-[11px] font-bold tracking-wider uppercase">
            {m.parking_longitude()}
          </span>
          <input
            bind:value={lngText}
            class="border-surface-300-700 bg-surface-100-900 focus:border-primary-500 w-full rounded-xl border px-4 py-3 font-mono text-base focus:ring-0 focus:outline-none"
            inputmode="decimal"
            oninput={edited}
            placeholder="2.611811"
            type="text"
          />
        </label>
      </div>

      <p class="text-surface-600-400 mt-3 text-xs leading-relaxed">{m.parking_coordinatesHint()}</p>

      <!-- Preview of the entered spot: a static map centred on the typed coordinates. -->
      <div class="border-surface-300-700 relative mt-5 h-46 overflow-hidden rounded-2xl border">
        {#if picked != null}
          <Map
            blocks={mapData.blocks}
            parkingLocations={mapData.parkingLocations}
            lineStrings={mapData.lineStrings}
            routeCountByBlock={mapData.routeCountByBlock}
            gradeCountByBlock={mapData.gradeCountByBlock}
            static
            focus={{ center: [picked.lat, picked.long], zoom: 15 }}
            pickMode
          />

          <div
            class="text-primary-500 pointer-events-none absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-full drop-shadow"
          >
            <Icon name="map-pin" size={32} fill="currentColor" />
          </div>
        {:else}
          <div
            class="text-surface-500 absolute inset-0 flex flex-col items-center justify-center gap-2 px-7 text-center"
          >
            <Icon name="map-pin" size={26} />
            <span class="text-sm font-medium">{m.parking_previewEmpty()}</span>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <!-- The picked location is the map centre; a fixed pin marks it. -->
    <div class="relative min-h-0 flex-1">
      <!-- Fill via absolute inset-0 (mirrors the /explore layout): the map's own height:100%
           can't resolve through the flex-grown parents, so give it a positioned box instead. -->
      <div class="absolute inset-0">
        <Map
          blocks={mapData.blocks}
          parkingLocations={mapData.parkingLocations}
          lineStrings={mapData.lineStrings}
          routeCountByBlock={mapData.routeCountByBlock}
          gradeCountByBlock={mapData.gradeCountByBlock}
          focus={placeFocus}
          onviewchange={(view) => {
            pannedCenter = view.center
            pannedZoom = view.zoom
          }}
          onreadermove={edited}
          pickMode
        />
      </div>

      <div
        class="bg-surface-100-900/90 border-surface-300-700 text-surface-700-300 pointer-events-none absolute top-3 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap backdrop-blur"
      >
        <Icon name="navigation" size={13} class="text-primary-500" />
        {m.parking_mapHint()}
      </div>

      <div
        class="text-primary-500 pointer-events-none absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-full drop-shadow"
      >
        <Icon name="map-pin" size={40} fill="currentColor" />
      </div>

      {#if mapCenter != null}
        <div
          class="bg-surface-100-900/90 border-surface-300-700 pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-xl border px-4 py-2.5 backdrop-blur"
        >
          <span class="bg-primary-500 size-2 flex-none rounded-full"></span>
          <span class="truncate font-mono text-sm font-semibold">{formatCoord(mapCenter)}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>
