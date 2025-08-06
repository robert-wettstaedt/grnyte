<script>
  import { page } from '$app/state'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug } from '$lib/helper'
  import AddAreaPage from './AddAreaPage.svelte'

  let { areaId } = $derived(convertAreaSlug())
</script>

{#if areaId == null}
  <AddAreaPage />
{:else}
  <ZeroQueryWrapper
    loadingIndicator={{ type: 'skeleton' }}
    query={page.data.z.current.query.areas.where('id', areaId).limit(1)}
  >
    {#snippet children([parent])}
      <AddAreaPage {parent} />
    {/snippet}
  </ZeroQueryWrapper>
{/if}
