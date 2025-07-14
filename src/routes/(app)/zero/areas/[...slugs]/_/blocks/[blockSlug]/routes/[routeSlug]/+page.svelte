<script lang="ts">
  import { page } from '$app/state'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { convertAreaSlug } from '$lib/helper'
  import RoutePage from './RoutePage.svelte'

  let { areaId } = $derived(convertAreaSlug())
</script>

<ZeroQueryWrapper
  loadingIndicator={{ type: 'skeleton' }}
  showEmpty
  query={page.data.z.current.query.blocks
    .where('slug', page.params.blockSlug)
    .where('areaFk', areaId)
    .whereExists('routes', (q) =>
      Number.isNaN(Number(page.params.routeSlug))
        ? q.where('slug', page.params.routeSlug)
        : q.where('id', Number(page.params.routeSlug)),
    )
    .related('routes', (q) => {
      let route = Number.isNaN(Number(page.params.routeSlug))
        ? q.where('slug', page.params.routeSlug)
        : q.where('id', Number(page.params.routeSlug))

      return route.related('tags')
    })
    .related('topos')
    .one()}
>
  {#snippet children(_block)}
    {#if _block}
      {@const block = { ..._block, topos: [..._block.topos] }}
      {@const route = { ..._block.routes[0], tags: [..._block.routes[0].tags] }}
      <RoutePage {block} {route} />
    {/if}
  {/snippet}
</ZeroQueryWrapper>
