<script>
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug } from '$lib/helper'
  import EditBlockPage from './EditBlockPage.svelte'

  let { areaId, areaSlug } = $derived(convertAreaSlug())
  const { blockSlug } = page.params
</script>

{#if areaId == null || areaSlug == null || blockSlug == null}
  <Error status={404} />
{:else}
  <ZeroQueryWrapper
    loadingIndicator={{ type: 'skeleton' }}
    query={page.data.z.current.query.blocks.where('slug', blockSlug).where('areaFk', areaId)}
    showEmpty
  >
    {#snippet children(blocks)}
      {@const block = blocks.at(0)}
      {#if block == null}
        <Error status={404} />
      {:else if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
        <Error status={401} />
      {:else if blocks.length > 1}
        <Error
          error={{ message: `Multiple blocks with slug ${blockSlug} in ${areaSlug} found. Please contact support.` }}
        />
      {:else}
        <EditBlockPage {block} />
      {/if}
    {/snippet}
  </ZeroQueryWrapper>
{/if}
