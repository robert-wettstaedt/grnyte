<script>
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug } from '$lib/helper'
  import EditAreaPage from './EditAreaPage.svelte'

  let { areaId } = $derived(convertAreaSlug())
</script>

{#if areaId == null}
  <Error status={404} />
{:else}
  <ZeroQueryWrapper
    loadingIndicator={{ type: 'skeleton' }}
    query={page.data.z.current.query.areas.where('id', areaId).limit(1)}
    showEmpty
  >
    {#snippet children([area])}
      {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
        <EditAreaPage {area} />
      {:else}
        <Error status={401} />
      {/if}
    {/snippet}
  </ZeroQueryWrapper>
{/if}
