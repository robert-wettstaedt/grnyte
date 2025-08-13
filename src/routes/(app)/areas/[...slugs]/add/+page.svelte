<script>
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug } from '$lib/helper'
  import AddAreaPage from './AddAreaPage.svelte'

  let { areaId } = $derived(convertAreaSlug())
</script>

{#if areaId == null}
  {#if page.data.userRegions.some( (region) => checkRegionPermission(page.data.userRegions, [REGION_PERMISSION_ADMIN], region.regionFk), )}
    <AddAreaPage />
  {:else}
    <Error status={401} />
  {/if}
{:else}
  <ZeroQueryWrapper
    loadingIndicator={{ type: 'skeleton' }}
    query={page.data.z.current.query.areas.where('id', areaId).limit(1)}
  >
    {#snippet children([parent])}
      {#if parent == null}
        <Error status={404} />
      {:else if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], parent.regionFk)}
        <Error status={401} />
      {:else}
        <AddAreaPage {parent} />
      {/if}
    {/snippet}
  </ZeroQueryWrapper>
{/if}
