<script lang="ts">
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { getAreaContext } from '$lib/contexts/area'
  import SyncExternalResourcesPage from './SyncExternalResourcesPage.svelte'

  const { data } = $props()
  const { area } = getAreaContext()
</script>

{#if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], area.regionFk)}
  <Error status={401} />
{:else}
  <ZeroQueryWrapper query={data.query}>
    {#snippet children(routes)}
      <SyncExternalResourcesPage {routes} />
    {/snippet}
  </ZeroQueryWrapper>
{/if}
