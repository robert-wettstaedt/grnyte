<script>
  import { checkRegionPermission, REGION_PERMISSION_ADMIN, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import AddAreaPage from './AddAreaPage.svelte'

  const { data } = $props()
</script>

{#if data.query == null}
  {#if pageState.userRegions.some( (region) => checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], region.regionFk), )}
    <AddAreaPage />
  {:else}
    <Error status={401} />
  {/if}
{:else}
  <ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} query={data.query}>
    {#snippet children(parent)}
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
