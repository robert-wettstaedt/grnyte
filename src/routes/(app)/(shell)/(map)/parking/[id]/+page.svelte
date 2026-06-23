<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { parkingDetail } from '$lib/entities/geolocation/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { sheetState } from '../../Modal/sheetState.svelte'
  import { onDestroy } from 'svelte'
  import ParkingActions from './ParkingActions.svelte'

  const parking = parkingDetail(() => Number(page.params.id))

  const formatCoord = (lat: number, long: number): string =>
    `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(long).toFixed(5)}°${long >= 0 ? 'E' : 'W'}`

  // Brief check-mark confirmation after copying the coordinate to the clipboard.
  let copied = $state(false)
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(copyTimer))

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      copied = true
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => (copied = false), 1500)
    } catch {
      // Clipboard unavailable (insecure context) or permission denied — nothing to recover from.
    }
  }

  // The (map) layout draws the sheet header from sheetState — label it with the
  // parking and, as a subtitle, the crag it belongs to.
  $effect(() => {
    sheetState.title = m.parking_title()
    sheetState.subtitle = parking.data?.area?.name ?? null
  })
</script>

<svelte:head>
  <title>{m.parking_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={parking}>
  {#snippet ready(data)}
    {@const coords = formatCoord(data.lat, data.long)}
    <div class="space-y-5">
      <ParkingActions parking={data} />

      <button
        type="button"
        class="border-surface-300-700 bg-surface-100-900 hover:bg-surface-200-800 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors"
        onclick={() => copy(coords)}
        aria-label={m.parking_copyCoordinates()}
      >
        <span class="bg-primary-500/15 text-primary-500 flex size-10 flex-none items-center justify-center rounded-xl">
          <Icon name="map-pin" size={20} />
        </span>
        <span class="min-w-0 flex-1 truncate font-mono text-sm font-semibold">{coords}</span>
        <Icon
          name={copied ? 'check' : 'copy'}
          size={18}
          class={['flex-none', copied ? 'text-primary-500' : 'text-surface-500']}
        />
      </button>
    </div>
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.parking_notFound()} />
  {/snippet}
</QueryState>
