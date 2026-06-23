<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Map from '$lib/map/Map.svelte'
  import { formatMetres, haversineMetres } from '$lib/map/map'
  import type { MapData, MapFocus } from '$lib/map/types'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    mapData: MapData
    pathFocus: MapFocus | null
    // The walking path as [lat, lng] points, starting at the parking (seeded by the parent).
    pathPoints?: [number, number][]
  }

  let { mapData, pathFocus, pathPoints = $bindable([]) }: Props = $props()

  const hasPath = $derived(pathPoints.length >= 2)

  const addWaypoint = (point: [number, number]) => (pathPoints = [...pathPoints, point])
  const undoWaypoint = () => {
    if (pathPoints.length > 1) pathPoints = pathPoints.slice(0, -1)
  }
  const clearPath = () => (pathPoints = pathPoints.slice(0, 1))

  // Approach distance (sum of segments) + a rough walking time at ~1.25 m/s.
  const pathMetres = $derived.by(() => {
    let total = 0
    for (let i = 1; i < pathPoints.length; i += 1) {
      total += haversineMetres(
        { lat: pathPoints[i - 1][0], long: pathPoints[i - 1][1] },
        { lat: pathPoints[i][0], long: pathPoints[i][1] },
      )
    }
    return total
  })
  const pathMinutes = $derived(Math.max(1, Math.round(pathMetres / 1.25 / 60)))
</script>

<!-- Tap the map to trace a walking path from the parking to the area. -->
<div class="relative min-h-0 flex-1">
  <Map {...mapData} drawPath focus={pathFocus} onpathpoint={addWaypoint} pathLine={pathPoints} />

  <div
    class="bg-surface-100-900/90 border-surface-300-700 text-surface-700-300 pointer-events-none absolute top-3 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap backdrop-blur"
  >
    <Icon name="navigation" size={13} class="text-primary-500" />
    {m.parking_pathDrawHint()}
  </div>

  {#if hasPath}
    <!-- Approach readout + path actions in one card, so the buttons read as path
         actions rather than blending into the map's own (filled) controls. -->
    <div
      class="bg-surface-100-900/90 border-surface-300-700 absolute bottom-3 left-3 z-20 flex items-center gap-3 rounded-xl border py-2 pr-2 pl-4 backdrop-blur"
    >
      <div class="flex min-w-0 flex-col">
        <span class="text-surface-500 text-[10px] font-bold tracking-wider uppercase">
          {m.parking_approach()}
        </span>
        <span class="truncate font-mono text-sm font-semibold">
          {formatMetres(pathMetres)} · ~{pathMinutes} min
        </span>
      </div>

      <div class="bg-surface-300-700 h-8 w-px flex-none"></div>

      <button
        aria-label={m.parking_undoPoint()}
        class="btn-icon preset-tonal-surface flex-none"
        onclick={undoWaypoint}
        type="button"
      >
        <Icon name="undo" size={18} />
      </button>

      <button
        aria-label={m.parking_clearPath()}
        class="btn-icon preset-tonal-surface flex-none"
        onclick={clearPath}
        type="button"
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  {:else}
    <div
      class="bg-surface-100-900/90 border-surface-300-700 text-surface-600-400 absolute bottom-3 left-3 z-20 rounded-xl border px-4 py-2.5 text-xs leading-relaxed backdrop-blur"
    >
      {m.parking_pathHint()}
    </div>
  {/if}
</div>
