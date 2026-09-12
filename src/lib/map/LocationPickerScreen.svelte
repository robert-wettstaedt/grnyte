<script lang="ts">
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import PageHeaderAction from '$lib/components/PageHeader/PageHeaderAction.svelte'
  import LocationPicker from '$lib/map/LocationPicker.svelte'
  import type { Bounds, MapData } from '$lib/map/types'
  import { m } from '$lib/paraglide/messages'

  type Coords = { lat: number; long: number }

  // A full-screen "set the location" sub-editor: a back/title/Done header over the
  // map · coordinates picker. Owns the picker's transient state so callers only deal
  // in the committed result. Reused by the add-block flow and (later) "move on the map".
  interface Props {
    areaExtent: Bounds | null
    /** Label of the screen returned to (shown next to the back arrow). */
    backLabel: string
    /** Seed the picker, e.g. the existing location when adjusting. */
    initial?: Coords | null
    mapData: MapData
    onBack: () => void
    onDone: (coords: Coords) => void
    title: string
  }

  const { areaExtent, backLabel, initial = null, mapData, onBack, onDone, title }: Props = $props()

  // Seeded once from `initial`; the screen remounts on each open, so it never goes stale.
  let mode = $state<'coordinates' | 'map'>('map')
  // svelte-ignore state_referenced_locally
  let latText = $state(initial == null ? '' : String(initial.lat))
  // svelte-ignore state_referenced_locally
  let lngText = $state(initial == null ? '' : String(initial.long))
  // svelte-ignore state_referenced_locally
  let picked = $state<Coords | null>(initial)
  // Frame on the seeded location.
  const placedCenter = $derived<[number, number] | null>(initial == null ? null : [initial.lat, initial.long])
</script>

<!-- flex-1 (not h-full): the QueryState wrapper is min-h-full, so height:100% has no
     definite parent to resolve against and would collapse. Filling as a flex item does. -->
<div class="flex min-h-0 flex-1 flex-col">
  <PageHeader {backLabel} onback={onBack} {title}>
    {#snippet action()}
      <PageHeaderAction
        disabled={picked == null}
        label={m.common_done()}
        onclick={() => picked != null && onDone(picked)}
      />
    {/snippet}
  </PageHeader>

  <LocationPicker {mapData} {areaExtent} {placedCenter} bind:mode bind:latText bind:lngText bind:picked />
</div>
