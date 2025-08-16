<script lang="ts">
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import SyncExternalResourcesPage from './SyncExternalResourcesPage.svelte'

  const { data } = $props()
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} query={data.query} showEmpty>
  {#snippet children(area)}
    {#if area != null && checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], area.regionFk)}
      <ZeroQueryWrapper
        query={page.data.z.current.query.routes
          .where('areaIds', 'ILIKE', `%^${area.id}$%`)
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
