<script lang="ts">
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import RouteLayout from './RouteLayout.svelte'

  const { data, ...props } = $props()
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} showEmpty query={data.routeQuery}>
  {#snippet children(block)}
    {@const route = block?.routes.at(0)}

    {#if block == null || route == null}
      <Error status={404} />
    {:else if block.routes.length > 1}
      <Error status={400} error={{ message: `Multiple routes with slug ${page.params.routeSlug} found` }} />
    {:else}
      {#key route.id}
        <RouteLayout children={props.children} {block} {route} />
      {/key}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
