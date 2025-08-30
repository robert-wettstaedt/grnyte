<script lang="ts">
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import EditFirstAscentPage from './EditFirstAscentPage.svelte'

  const { data } = $props()
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} showEmpty query={data.query}>
  {#snippet children(block)}
    {@const route = block?.routes.at(0)}

    {#if block == null || route == null}
      <Error status={404} />
    {:else if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], route.regionFk)}
      <Error status={401} />
    {:else if block.routes.length > 1}
      <Error status={400} error={{ message: `Multiple routes with slug ${page.params.routeSlug} found` }} />
    {:else}
      <ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} showEmpty query={data.faQuery}>
        {#snippet children(firstAscensionists)}
          <EditFirstAscentPage {firstAscensionists} {route} />
        {/snippet}
      </ZeroQueryWrapper>
    {/if}
  {/snippet}
</ZeroQueryWrapper>
