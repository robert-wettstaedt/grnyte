<script lang="ts">
  import { page } from '$app/state'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug } from '$lib/helper'
  import AreaPage from './AreaPage.svelte'

  let { areaSlug, parentSlug } = $derived(convertAreaSlug())

  const query = $derived.by(() => {
    let query = page.data.z.current.query.areas
      .where('slug', areaSlug)
      .related('author')
      .related('parent')
      .related('files')
      .related('parkingLocations')
      .one()

    if (parentSlug == null) {
      query = query.where('parentFk', 'IS', null)
    } else {
      query = query.whereExists('parent', (q) => q.where('slug', parentSlug))
    }

    return query
  })
</script>

<ZeroQueryWrapper {query} loadingIndicator={{ type: 'skeleton' }} showEmpty>
  {#snippet children(area)}
    {#if area != null}
      <AreaPage {area} />
    {/if}
  {/snippet}
</ZeroQueryWrapper>
