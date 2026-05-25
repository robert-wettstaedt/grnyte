<script lang="ts">
  import { resolve } from '$app/paths'
  import GenericList from '$lib/components/GenericList'
  import RouteListItem from '$lib/components/RouteListItem'
  import TopoImage from '$lib/components/TopoViewer/TopoImage.svelte'
  import { getBlockContext } from '$lib/contexts/block'
  import { enrichTopo, sortRoutesByTopo } from '$lib/topo'
  import BlockActions from './BlockActions.svelte'

  const { block } = getBlockContext()

  const topos = $derived(
    block.topos
      .map((topo) =>
        enrichTopo({
          ...topo,
          routes: topo.routes.map((topoRoute) => ({
            ...topoRoute,
            route: block.routes.find((route) => route.id === topoRoute.routeFk),
          })),
        }),
      )
      .filter((d) => d != null) ?? [],
  )

  const routes = $derived(
    sortRoutesByTopo([...(block?.routes ?? [])], topos).map((route) => {
      const topo = topos.find((topo) => topo.routes.some((topoRoute) => topoRoute.routeFk === route.id))
      return { ...route, topo }
    }),
  )
</script>

<BlockActions />

{#if topos.length > 0}
  <div
    class="scrollbar-thin -mx-4 flex snap-x snap-mandatory snap-center scroll-px-4 gap-2 overflow-x-auto scroll-smooth px-4 py-4 md:-mx-6 md:px-6"
  >
    {#each topos as topo (topo.id)}
      <a
        class="h-50 shrink-0 snap-start *:rounded-xl *:transition hover:*:scale-105 hover:*:opacity-90"
        href={resolve('/(new)/bla/(stack)/topos/[id]', { id: topo.id.toString() })}
      >
        <TopoImage value={topo} />
      </a>
    {/each}
  </div>
{/if}

{#if routes.length > 0}
  <div class="-mx-2 w-[calc(100%+(var(--spacing)*4))] md:-mx-4 md:w-[calc(100%+(var(--spacing)*8))]">
    <GenericList
      class="w-full"
      items={routes.map((route) => ({
        ...route,
        id: route.id!,
        name: route.name,
        pathname: `/bla/routes/${route.id}`,
      }))}
    >
      {#snippet left(route)}
        <RouteListItem route={{ ...route, block }} showImage={topos.length > 1} />
      {/snippet}
    </GenericList>
  </div>
{/if}
