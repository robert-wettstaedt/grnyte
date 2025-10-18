<script lang="ts">
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { getRouteContext } from '$lib/contexts/route'
  import EditFirstAscentPage from './EditFirstAscentPage.svelte'

  const { data } = $props()
  const { route } = getRouteContext()
</script>

{#if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], route.regionFk)}
  <Error status={401} />
{:else}
  <ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} showEmpty query={data.faQuery}>
    {#snippet children(firstAscensionists)}
      <EditFirstAscentPage {firstAscensionists} />
    {/snippet}
  </ZeroQueryWrapper>
{/if}
