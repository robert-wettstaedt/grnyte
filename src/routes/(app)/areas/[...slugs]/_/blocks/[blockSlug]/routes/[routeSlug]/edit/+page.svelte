<script lang="ts">
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import { getRouteContext } from '$lib/contexts/route'
  import EditRoutePage from './EditRoutePage.svelte'

  const { route } = getRouteContext()
</script>

{#if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], route.regionFk)}
  <Error status={401} />
{:else}
  <EditRoutePage />
{/if}
