<script lang="ts">
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import type { RouteDetail } from '$lib/entities/route/dto'
  import { m } from '$lib/paraglide/messages'
  import type { QueryResource } from '$lib/zero/resource.svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    block: QueryResource<BlockDetail | undefined>
    /** Rendered once both rows are in: the route first, then its block. */
    ready: Snippet<[RouteDetail, BlockDetail]>
    route: QueryResource<RouteDetail | undefined>
  }

  // Not destructured: the nested `{#snippet ready}` below would shadow a local `ready`.
  let props: Props = $props()
</script>

<!-- A route's forms all want its block too (context card, breadcrumb, the region mentions resolve
     against), and the block query keys off the loaded route, so the two states nest. One place, so
     the not-found copy cannot drift between the pages. -->
<QueryState notFound={m.routes_notFound()} resource={props.route}>
  {#snippet ready(routeData)}
    <QueryState notFound={m.blocks_notFound()} resource={props.block}>
      {#snippet ready(blockData)}
        {@render props.ready(routeData, blockData)}
      {/snippet}
    </QueryState>
  {/snippet}
</QueryState>
