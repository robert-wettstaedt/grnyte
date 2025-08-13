<script lang="ts">
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug } from '$lib/helper'
  import SyncExternalResourcesPage from './SyncExternalResourcesPage.svelte'

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
      {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], area.regionFk)}
        <ZeroQueryWrapper
          query={page.data.z.current.query.routes
            .where('areaIds', 'ILIKE', `%^${areaId}$%`)
            .related('block')
            .related('externalResources', (q) =>
              q.related('externalResource27crags').related('externalResource8a').related('externalResourceTheCrag'),
            )}
        >
          {#snippet children(routes)}
            <SyncExternalResourcesPage {area} {routes} />
          {/snippet}
        </ZeroQueryWrapper>
      {:else}
        <Error status={404} />
      {/if}
    {/snippet}
  </ZeroQueryWrapper>
{/if}
