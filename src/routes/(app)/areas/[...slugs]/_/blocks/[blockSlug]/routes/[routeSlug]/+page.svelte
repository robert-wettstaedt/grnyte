<script lang="ts">
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug, getRouteDbFilter } from '$lib/helper'
  import RoutePage from './RoutePage.svelte'

  let { areaId } = $derived(convertAreaSlug())
</script>

{#if areaId == null || page.params.blockSlug == null || page.params.routeSlug == null}
  <Error status={404} />
{:else}
  <ZeroQueryWrapper
    loadingIndicator={{ type: 'skeleton' }}
    showEmpty
    query={page.data.z.current.query.blocks
      .where('slug', page.params.blockSlug)
      .where('areaFk', areaId)
      .whereExists('routes', getRouteDbFilter)
      .related('routes', (q) => getRouteDbFilter(q).related('tags'))
      .related('topos')
      .limit(1)}
  >
    {#snippet children([_block])}
      {@const block = { ..._block, topos: [..._block.topos] }}
      {@const route = { ..._block.routes[0], tags: [..._block.routes[0].tags] }}

      {#if route == null}
        <Error status={404} />
      {:else if block.routes.length > 1}
        <Error status={400} error={{ message: `Multiple routes with slug ${page.params.routeSlug} found` }} />
      {:else}
        <RoutePage {block} {route} />
      {/if}
    {/snippet}
  </ZeroQueryWrapper>
{/if}
