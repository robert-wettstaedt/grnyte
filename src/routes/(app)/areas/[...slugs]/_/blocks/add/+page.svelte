<script>
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug } from '$lib/helper'
  import AddBlockPage from './AddBlockPage.svelte'

  let { areaId } = $derived(convertAreaSlug())
</script>

{#if areaId == null}
  <Error status={404} />
{:else}
  <ZeroQueryWrapper
    loadingIndicator={{ type: 'skeleton' }}
    query={page.data.z.current.query.areas.where('id', areaId).related('blocks').one()}
    showEmpty
  >
    {#snippet children(area)}
      {#if area == null}
        <Error status={404} />
      {:else if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
        <Error status={401} />
      {:else}
        <AddBlockPage {area} name="Block {area.blocks.length + 1}" />
      {/if}
    {/snippet}
  </ZeroQueryWrapper>
{/if}
