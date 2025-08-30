<script>
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import { getAreaContext } from '$lib/contexts/area'
  import EditParkingLocationPage from './EditParkingLocationPage.svelte'

  const { area } = getAreaContext()
</script>

{#if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
  <Error status={401} />
{:else}
  <EditParkingLocationPage />
{/if}
