<script>
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import EditParkingLocationPage from './EditParkingLocationPage.svelte'

  const { data } = $props()
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} query={data.query} showEmpty>
  {#snippet children(area)}
    {#if area == null}
      <Error status={404} />
    {:else if area.type === 'area'}
      <Error error={{ message: 'Area must be of type `area`' }} />
    {:else if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
      <Error status={401} />
    {:else}
      <EditParkingLocationPage {area} />
    {/if}
  {/snippet}
</ZeroQueryWrapper>
