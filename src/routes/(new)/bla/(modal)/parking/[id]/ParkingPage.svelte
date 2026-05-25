<script lang="ts">
  import { resolve } from '$app/paths'
  import { getParkingContext } from '$lib/contexts/parking'
  import { getI18n } from '$lib/i18n'
  import { sheetState } from '../../Modal'
  import ParkingActions from './ParkingActions.svelte'

  const { geolocation } = getParkingContext()
  const { t } = getI18n()

  $effect(() => {
    sheetState.title = t('parking.location')
    sheetState.subtitle = geolocation.area != null ? subtitleSnippet : null
  })
</script>

{#snippet subtitleSnippet()}
  {#if geolocation.area != null}
    <a class="anchor text-xs" href={resolve('/(new)/bla/(modal)/areas/[id]', { id: geolocation.area.id.toString() })}>
      {geolocation.area.name}
    </a>
  {/if}
{/snippet}

<ParkingActions />
