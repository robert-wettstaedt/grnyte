<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LocationPicker from '$lib/map/LocationPicker.svelte'
  import type { MapData } from '$lib/map/types'
  import { m } from '$lib/paraglide/messages'

  type Coords = { lat: number; long: number }

  // A full-screen "set the location" sub-editor: a back/title/Done header over the
  // map · coordinates picker. Owns the picker's transient state so callers only deal
  // in the committed result. Reused by the add-block flow and (later) "move on the map".
  interface Props {
    mapData: MapData
    areaExtent: [number, number, number, number] | null
    /** Seed the picker, e.g. the existing location when adjusting. */
    initial?: Coords | null
    title: string
    /** Label of the screen returned to (shown next to the back arrow). */
    backLabel: string
    onBack: () => void
    onDone: (coords: Coords) => void
  }

  const { mapData, areaExtent, initial = null, title, backLabel, onBack, onDone }: Props = $props()

  // Seeded once from `initial`; the screen remounts on each open, so it never goes stale.
  let mode = $state<'map' | 'coordinates'>('map')
  // svelte-ignore state_referenced_locally
  let latText = $state(initial == null ? '' : String(initial.lat))
  // svelte-ignore state_referenced_locally
  let lngText = $state(initial == null ? '' : String(initial.long))
  // svelte-ignore state_referenced_locally
  let picked = $state<Coords | null>(initial)
  // Frame on the seeded location.
  const placedCenter = $derived<[number, number] | null>(initial == null ? null : [initial.lat, initial.long])
</script>

<div class="flex h-full flex-col">
  <header
    class="border-surface-200-800 bg-surface-50-950/90 sticky top-0 z-10 flex items-center justify-between gap-2 border-b px-3 py-3 backdrop-blur"
  >
    <button class="btn preset-tonal-surface" onclick={onBack} type="button">
      <Icon name="arrow-left" size={16} />
      {backLabel}
    </button>
    <span class="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm font-bold whitespace-nowrap">
      {title}
    </span>
    <button
      class="btn preset-filled-primary-500"
      disabled={picked == null}
      onclick={() => picked != null && onDone(picked)}
      type="button"
    >
      {m.common_done()}
    </button>
  </header>

  <LocationPicker {mapData} {areaExtent} {placedCenter} bind:mode bind:latText bind:lngText bind:picked />
</div>
