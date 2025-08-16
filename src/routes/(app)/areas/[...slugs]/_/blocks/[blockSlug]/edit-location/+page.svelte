<script>
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { blockWithPathname } from '$lib/db/utils.svelte'
  import { convertAreaSlug } from '$lib/helper'
  import EditLocationPage from './EditLocationPage.svelte'

  const { data } = $props()
  let { areaSlug } = $derived(convertAreaSlug())
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} query={data.query} showEmpty>
  {#snippet children(blocks)}
    {@const block = blocks.at(0) == null ? undefined : blockWithPathname(blocks[0])}

    {#if block == null}
      <Error status={404} />
    {:else if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block.regionFk) && block.geolocationFk != null}
      <Error status={401} />
    {:else if blocks.length > 1}
      <Error
        error={{
          message: `Multiple blocks with slug ${page.params.blockSlug} in ${areaSlug} found. Please contact support.`,
        }}
      />
    {:else}
      <EditLocationPage {block} />
    {/if}
  {/snippet}
</ZeroQueryWrapper>
