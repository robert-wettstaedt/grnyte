<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import Map from '$lib/map/Map.svelte'
  import type { MapData } from '$lib/map/types'
  import { m } from '$lib/paraglide/messages'

  type Coords = { lat: number; long: number }

  // The block's location as a form field: a recommended-but-optional control that is
  // either an empty state (pin via current location / map) or a located preview card
  // (adjust / remove). Purely presentational — the parent owns the location + actions.
  interface Props {
    location: Coords | null
    /** Map layers for the located-state preview. */
    mapData: MapData
    /** Device-location request in flight (drives the button spinner). */
    locating: boolean
    onUseCurrentLocation: () => void
    /** Open the picker — both "Choose on map" (empty) and "Adjust" (located). */
    onPickLocation: () => void
    onRemove: () => void
  }

  const { location, mapData, locating, onUseCurrentLocation, onPickLocation, onRemove }: Props = $props()

  const formatCoord = (c: Coords): string =>
    `${Math.abs(c.lat).toFixed(5)}°${c.lat >= 0 ? 'N' : 'S'}  ·  ${Math.abs(c.long).toFixed(5)}°${c.long >= 0 ? 'E' : 'W'}`
</script>

<div class="space-y-2.5">
  <!-- Not a labelable input, so this mirrors the real field label from
       RemoteFormInputWrapper (semibold) instead of inventing its own style. -->
  <div class="text-surface-700-300 flex items-center gap-2 text-sm font-semibold">
    {m.common_location()}

    <span
      class="bg-primary-500/15 text-primary-400 inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10.5px] font-bold tracking-[0.03em] uppercase"
    >
      <Icon name="navigation" size={11} />
      {m.common_recommended()}
    </span>
  </div>

  {#if location == null}
    <!-- Empty state. -->
    <div
      class="border-surface-300-700 bg-surface-100-900 flex flex-col items-center rounded-2xl border border-dashed px-4 py-5 text-center"
    >
      <span class="bg-primary-500/15 text-primary-400 mb-3 flex size-14 items-center justify-center rounded-2xl">
        <Icon name="map-pin" size={26} />
      </span>

      <div class="mb-1.5 text-base font-bold tracking-tight">{m.blocks_add_locationTitle()}</div>

      <p class="text-surface-600-400 mb-4 max-w-64 text-sm leading-relaxed">{m.blocks_add_locationBody()}</p>

      <button
        class="btn preset-filled-primary-500 h-12 w-full rounded-xl text-base font-bold shadow-[0_8px_20px_-10px_var(--color-primary-500)]"
        disabled={locating}
        onclick={onUseCurrentLocation}
        type="button"
      >
        <span class="inline-flex size-4.75 flex-none items-center justify-center">
          {#if locating}
            <LoadingIndicator size="19px" />
          {:else}
            <Icon name="locate" size={19} />
          {/if}
        </span>
        {locating ? m.blocks_add_locating() : m.blocks_add_useCurrentLocation()}
      </button>

      <button
        class="btn border-surface-300-700 text-surface-950-50 hover:bg-surface-200-800 mt-2.5 h-12 w-full rounded-xl border bg-transparent text-base font-semibold"
        onclick={onPickLocation}
        type="button"
      >
        <Icon name="map-pin" size={18} />
        {m.blocks_add_chooseOnMap()}
      </button>
    </div>
    <p class="text-surface-500 px-0.5 text-xs leading-relaxed">{m.blocks_add_locationNote()}</p>
  {:else}
    <!-- Located state: map preview + actions. -->
    <div class="border-surface-200-800 bg-surface-100-900 overflow-hidden rounded-2xl border">
      <div class="relative h-36">
        <Map
          blocks={mapData.blocks}
          gradeCountByBlock={mapData.gradeCountByBlock}
          lineStrings={mapData.lineStrings}
          parkingLocations={mapData.parkingLocations}
          routeCountByBlock={mapData.routeCountByBlock}
          static
          focus={{ center: [location.lat, location.long], zoom: 15 }}
          pickMode
        />

        <div
          class="text-primary-500 pointer-events-none absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-full drop-shadow"
        >
          <Icon name="map-pin" size={30} fill="currentColor" />
        </div>

        <div
          class="bg-surface-100-900/90 border-surface-300-700 text-success-600-400 absolute top-2.5 right-2.5 z-20 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold backdrop-blur"
        >
          <Icon name="check" size={13} />
          {m.blocks_add_located()}
        </div>
      </div>

      <div class="flex items-center gap-3 p-3">
        <span class="bg-primary-500/15 text-primary-400 flex size-9 flex-none items-center justify-center rounded-lg">
          <Icon name="map-pin" size={17} />
        </span>

        <div class="min-w-0 flex-1">
          <div class="text-sm font-bold tracking-tight">{m.blocks_add_locationSet()}</div>
          <div class="text-surface-600-400 truncate font-mono text-[11.5px] font-semibold">{formatCoord(location)}</div>
        </div>

        <button class="btn preset-tonal-surface flex-none" onclick={onPickLocation} type="button">
          <Icon name="edit" size={14} />
          {m.common_adjust()}
        </button>
      </div>

      <button
        class="border-surface-200-800 text-error-500 hover:bg-error-500/10 flex w-full items-center justify-center gap-2 border-t py-3 text-sm font-semibold"
        onclick={onRemove}
        type="button"
      >
        <Icon name="map-pin-x" size={15} />
        {m.blocks_add_removeLocation()}
      </button>
    </div>
  {/if}
</div>
