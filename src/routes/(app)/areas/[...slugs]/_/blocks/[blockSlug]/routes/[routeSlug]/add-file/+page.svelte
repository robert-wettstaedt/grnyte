<script lang="ts">
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import { getRouteContext } from '$lib/contexts/route'
  import AddFilePage from './AddFilePage.svelte'

  const { route } = getRouteContext()
</script>

{#if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], route.regionFk)}
  <Error status={401} />
{:else}
  <AddFilePage />
{/if}
