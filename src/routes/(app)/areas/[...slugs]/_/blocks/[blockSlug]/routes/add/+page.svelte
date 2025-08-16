<script>
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug } from '$lib/helper'
  import AddRoutePage from './AddRoutePage.svelte'

  const { data } = $props()
  let { areaSlug } = $derived(convertAreaSlug())
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} query={data.query} showEmpty>
  {#snippet children(blocks)}
    {@const block = blocks.at(0)}

    {#if block == null}
      <Error status={404} />
    {:else if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
      <Error status={401} />
    {:else if blocks.length > 1}
      <Error
        error={{
          message: `Multiple blocks with slug ${page.params.blockSlug} in ${areaSlug} found. Please contact support.`,
        }}
      />
    {:else}
      <AddRoutePage {block} />
    {/if}
  {/snippet}
</ZeroQueryWrapper>
