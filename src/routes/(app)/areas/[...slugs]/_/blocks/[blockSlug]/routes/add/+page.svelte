<script>
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import { getBlockContext } from '$lib/contexts/block'
  import AddRoutePage from './AddRoutePage.svelte'

  const { block } = getBlockContext()
</script>

{#if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
  <Error status={401} />
{:else}
  <AddRoutePage />
{/if}
