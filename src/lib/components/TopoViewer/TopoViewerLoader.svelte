<script lang="ts">
  import { page } from '$app/state'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { queries, type Row } from '$lib/db/zero'
  import { enrichTopo, sortRoutesByTopo, type TopoDTO } from '$lib/topo'
  import type { Snippet } from 'svelte'
  import TopoViewer, { type TopoViewerProps } from './TopoViewer.svelte'

  interface RouteWithTopo extends Row<'routes'> {
    topo?: TopoDTO
  }

  interface Props extends Omit<TopoViewerProps, 'topos'> {
    children?: Snippet<[TopoDTO[], RouteWithTopo[]]>
    blockId: number | undefined | null
  }

  const { blockId, children: propsChildren, ...props }: Props = $props()
</script>

{#if blockId != null}
  <ZeroQueryWrapper query={queries.block(page.data, { blockId })}>
    {#snippet children(block)}
      {@const topos =
        block?.topos
          .map((topo) =>
            enrichTopo({
              ...topo,
              routes: topo.routes.map((topoRoute) => ({
                ...topoRoute,
                route: block.routes.find((route) => route.id === topoRoute.routeFk),
              })),
            }),
          )
          .filter((d) => d != null) ?? []}

      {@const routes = sortRoutesByTopo([...(block?.routes ?? [])], topos).map((route) => {
        const topo = topos.find((topo) => topo.routes.some((topoRoute) => topoRoute.routeFk === route.id))
        return { ...route, topo }
      })}

      {#if propsChildren == null}
        <div class="flex">
          <section class="relative w-full" use:fitHeightAction>
            <TopoViewer {...props} {topos} />
          </section>
        </div>
      {:else}
        {@render propsChildren(topos, routes)}
      {/if}
    {/snippet}
  </ZeroQueryWrapper>
{/if}
