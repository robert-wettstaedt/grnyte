<script>
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug } from '$lib/helper'
  import EditAreaPage from './EditAreaPage.svelte'

  let { areaId } = $derived(convertAreaSlug())
</script>

{#if areaId == null}
  <Error error={{ message: 'Not found' }} status={404} />
{:else}
  <ZeroQueryWrapper
    loadingIndicator={{ type: 'skeleton' }}
    query={page.data.z.current.query.areas.where('id', areaId).limit(1)}
    showEmpty
  >
    {#snippet children([area])}
      <EditAreaPage {area} />
    {/snippet}
  </ZeroQueryWrapper>
{/if}
