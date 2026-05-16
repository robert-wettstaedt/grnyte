<script lang="ts">
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper/ZeroQueryWrapper.svelte'
  import { getAreaContext } from '$lib/contexts/area'
  import { queries } from '$lib/db/zero'
  import AddBlockPage from './AddBlockPage.svelte'

  const { area } = getAreaContext()
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} query={queries.listBlocks({ areaId: area.id })}>
  {#snippet children(blocks)}
    {@const name = `Block ${blocks.length + 1}`}

    {#if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
      <Error status={401} />
    {:else}
      <AddBlockPage {name} />
    {/if}
  {/snippet}
</ZeroQueryWrapper>
