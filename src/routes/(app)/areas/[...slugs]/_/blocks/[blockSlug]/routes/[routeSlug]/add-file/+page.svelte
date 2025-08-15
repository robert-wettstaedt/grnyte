<script lang="ts">
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug, getRouteDbFilter } from '$lib/helper'
  import AddFilePage from './AddFilePage.svelte'

  let { areaId } = $derived(convertAreaSlug())
</script>

{#if areaId == null || page.params.blockSlug == null || page.params.routeSlug == null}
  <Error status={404} />
{:else}
  <ZeroQueryWrapper
    loadingIndicator={{ type: 'skeleton' }}
    showEmpty
    query={page.data.z.current.query.blocks
      .where('slug', page.params.blockSlug)
      .where('areaFk', areaId)
      .whereExists('routes', getRouteDbFilter)
      .related('routes', getRouteDbFilter)
      .limit(1)}
  >
    {#snippet children([block])}
      {@const route = block.routes.at(0)}

      {#if route == null}
        <Error status={404} />
      {:else if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], route.regionFk)}
        <Error status={401} />
      {:else if block.routes.length > 1}
        <Error status={400} error={{ message: `Multiple routes with slug ${page.params.routeSlug} found` }} />
      {:else}
        <AddFilePage {route} />
      {/if}
    {/snippet}
  </ZeroQueryWrapper>
{/if}
