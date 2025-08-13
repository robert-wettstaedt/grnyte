<script>
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug } from '$lib/helper'
  import AddBlockPage from './AddBlockPage.svelte'

  let { areaId } = $derived(convertAreaSlug())
</script>

{#if areaId == null}
  <Error error={{ message: 'Not found' }} status={404} />
{:else}
  <ZeroQueryWrapper
    loadingIndicator={{ type: 'skeleton' }}
    query={page.data.z.current.query.blocks.where('areaFk', areaId).related('area')}
    showEmpty
  >
    {#snippet children(blocks)}
      {@const area = blocks.find((block) => block.area != null)?.area}
      {#if area == null}
        <Error error={{ message: 'Not found' }} status={404} />
      {:else}
        <AddBlockPage {area} name="Block {blocks.length + 1}" />
      {/if}
    {/snippet}
  </ZeroQueryWrapper>
{/if}
