<script lang="ts">
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug } from '$lib/helper'
  import BlockPage from './BlockPage.svelte'

  let { areaId } = $derived(convertAreaSlug())
</script>

{#if areaId == null || page.params.blockSlug == null}
  <Error error={{ message: 'Not found' }} status={404} />
{:else}
  <ZeroQueryWrapper
    loadingIndicator={{ type: 'skeleton' }}
    showEmpty
    query={page.data.z.current.query.blocks
      .where('areaFk', areaId)
      .where('slug', page.params.blockSlug)
      .related('topos')
      .one()}
  >
    {#snippet children(_block)}
      {#if _block != null}
        {@const block = { ..._block, topos: [..._block.topos] }}

        <BlockPage {block} />
      {/if}
    {/snippet}
  </ZeroQueryWrapper>
{/if}
