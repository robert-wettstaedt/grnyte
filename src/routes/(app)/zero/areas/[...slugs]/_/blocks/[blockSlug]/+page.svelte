<script lang="ts">
  import { page } from '$app/state'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug } from '$lib/helper'
  import BlockPage from './BlockPage.svelte'

  let { areaId } = $derived(convertAreaSlug())
</script>

<ZeroQueryWrapper
  loadingIndicator={{ type: 'skeleton' }}
  showEmpty
  query={page.data.z.current.query.blocks
    .where('slug', page.params.blockSlug)
    .where('areaFk', areaId)
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
