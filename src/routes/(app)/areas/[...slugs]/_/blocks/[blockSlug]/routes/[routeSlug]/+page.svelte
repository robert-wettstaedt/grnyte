<script lang="ts">
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import RoutePage from './RoutePage.svelte'

  const { data } = $props()
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} showEmpty query={data.query}>
  {#snippet children(block)}
    {@const route = block?.routes.at(0)}

    {#if block == null || route == null}
      <Error status={404} />
    {:else if block.routes.length > 1}
      <Error status={400} error={{ message: `Multiple routes with slug ${page.params.routeSlug} found` }} />
    {:else}
      <RoutePage {block} {route} />
    {/if}
  {/snippet}
</ZeroQueryWrapper>
