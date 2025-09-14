<script>
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { getAreaContext } from '$lib/contexts/area'
  import AddBlockPage from './AddBlockPage.svelte'

  const { data } = $props()
  const { area } = getAreaContext()
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} query={data.query}>
  {#snippet children(blocks)}
    {#if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
      <Error status={401} />
    {:else}
      <AddBlockPage name="Block {blocks.length + 1}" />
    {/if}
  {/snippet}
</ZeroQueryWrapper>
