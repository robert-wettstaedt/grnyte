<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Breadcrumb from '$lib/components/Breadcrumb/Breadcrumb.svelte'
  import RouteRow from '$lib/components/EntityRow/RouteRow.svelte'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import ReferencedBy from '$lib/components/ReferencedBy/ReferencedBy.svelte'
  import { toSheetNav } from '$lib/components/SiblingNav/siblingNav'
  import Topo from '$lib/components/Topo/Topo.svelte'
  import { userAscentStatus } from '$lib/entities/ascent/resources.svelte'
  import { blockBreadcrumbArea } from '$lib/entities/block/breadcrumb'
  import { blockDetail, blockList, blockRouteList } from '$lib/entities/block/resources.svelte'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { selectTopoForRoute } from '$lib/entities/topo/mapper'
  import { orderRoutesByTopo } from '$lib/entities/topo/order'
  import { canEditTopo } from '$lib/entities/topo/permissions'
  import { blockTopoList } from '$lib/entities/topo/resources.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { sheetState } from '../../../Modal/sheetState.svelte'
  import BlockActions from './BlockActions.svelte'

  const global = getGlobalState()

  const blockId = $derived(Number(page.params.id))

  // Getter keeps the resource live across navigation between blocks — the query
  // re-targets as the param changes.
  const block = blockDetail(() => blockId)

  // Topos (with their drawn route lines) and the block's routes, both off the same
  // `queries.block` instance Zero dedupes. Routes are ordered the way they read
  // left-to-right across the topos.
  const topos = blockTopoList(() => blockId)
  const routes = blockRouteList(() => blockId)
  const orderedRoutes = $derived(orderRoutesByTopo(routes.data, topos.data))

  // The user's tick per route, shown on every row.
  const ascentStatus = userAscentStatus(() => global.user?.id)

  // Siblings for prev/next nav (ordered by `order`). The immediate area is the last
  // entry of the containment chain. -1 while the block loads → empty result, no
  // all-blocks scan.
  const areaId = $derived(block.data?.areas.at(-1)?.id ?? -1)
  const siblings = blockList(() => ({ areaId }))

  const blockHref = (id: number) => resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(id) })

  const breadcrumbArea = $derived(block.data == null ? null : blockBreadcrumbArea(block.data))

  // The shared Modal renders its header from sheetState, so feed it the title
  // (name + Block tag), the area trail as the subtitle, and the prev/next nav as
  // floating controls pinned just above the sheet's top edge.
  $effect(() => {
    const data = block.data
    sheetState.title = title
    sheetState.subtitle = data != null && data.areas.length > 0 ? breadcrumb : null
    sheetState.nav = toSheetNav(siblings.data, data?.id, blockHref)
    return () => (sheetState.nav = null)
  })
</script>

<svelte:head>
  <title>{block.data?.name ?? m.common_block()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={block}>
  {#snippet ready(detail)}
    <div class="space-y-5">
      <BlockActions block={detail} />

      {#if topos.data.length > 0}
        <div class="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
          {#each topos.data as topo (topo.id)}
            <a
              class="block shrink-0 snap-start"
              href={resolve('/(app)/(shell)/(explore)/blocks/[id]/topos/[topoId]', {
                id: String(detail.id),
                topoId: String(topo.id),
              })}
              aria-label={m.topo_alt()}
            >
              <Topo
                class="h-60 w-auto"
                imagePath={topo.imagePath}
                width={topo.imageWidth}
                height={topo.imageHeight}
                alt={m.topo_alt()}
                lines={topo.lines.map((line) => ({
                  band: getGradeBand(line.gradeFk),
                  id: line.id,
                  points: line.points,
                  topType: line.topType,
                }))}
              />
            </a>
          {/each}
        </div>
      {:else if canEditTopo(global.userRegions, detail)}
        <!-- No topos yet: the strip is hidden, so this is the only entry point to author the first one. -->
        <a
          class="btn preset-tonal-primary w-full"
          href={resolve('/(app)/blocks/[id]/topos/edit', { id: String(detail.id) })}
        >
          <Icon name="image" size={18} />
          {m.topo_addTopos()}
        </a>
      {/if}

      {#if orderedRoutes.length > 0}
        <section class="space-y-2">
          <h2 class="text-surface-600-400 text-sm font-bold tracking-wider uppercase">
            {m.routes_routesCount({ count: orderedRoutes.length })}
          </h2>
          <nav class="flex flex-col gap-1.5">
            {#each orderedRoutes as route (route.id)}
              {@const topo = selectTopoForRoute(topos.data, route.id)}
              <RouteRow
                route={{ ...route, topoImagePath: topo?.view.imagePath, topoPoints: topo?.line.points }}
                grade={gradeLabel(global.grades, global.gradingScale, route.gradeFk)}
                status={ascentStatus.get(route.id)}
                href={resolve('/(app)/routes/[id]', { id: String(route.id) })}
              />
            {/each}
          </nav>
        </section>
      {/if}

      <ReferencedBy type="blocks" id={detail.id} />
    </div>
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.common_block()} />
  {/snippet}
</QueryState>

{#snippet breadcrumb()}
  {#if breadcrumbArea != null}
    <Breadcrumb area={breadcrumbArea} userRegions={global.userRegions} />
  {/if}
{/snippet}

{#snippet title()}
  {#if block.data != null}
    <div class="flex items-center gap-2">
      {block.data.name}

      <span
        class="bg-primary-500/20 text-primary-400 inline-flex h-5.25 items-center rounded-[7px] px-2 text-[11px] font-bold tracking-[0.02em]"
      >
        {m.common_block()}
      </span>
    </div>
  {/if}
{/snippet}
