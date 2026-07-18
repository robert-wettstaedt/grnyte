<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Breadcrumb from '$lib/components/Breadcrumb/Breadcrumb.svelte'
  import RouteRow from '$lib/components/EntityRow/RouteRow.svelte'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { isNavKeyExempt, toSheetNav } from '$lib/components/SiblingNav/siblingNav'
  import Topo from '$lib/components/Topo/Topo.svelte'
  import { userAscentStatus } from '$lib/entities/ascent/resources.svelte'
  import { blockBreadcrumbArea } from '$lib/entities/block/breadcrumb'
  import { blockDetail, blockRouteList } from '$lib/entities/block/resources.svelte'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { orderRoutesByTopo } from '$lib/entities/topo/order'
  import { canEditTopo } from '$lib/entities/topo/permissions'
  import { blockTopoList } from '$lib/entities/topo/resources.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'
  import Panel from '../../../../Modal/Panel.svelte'
  import { sheetState } from '../../../../Modal/sheetState.svelte'

  const global = getGlobalState()

  const blockId = $derived(Number(page.params.id))
  const topoId = $derived(Number(page.params.topoId))

  // All off the same `queries.block` instance the block detail page uses — Zero
  // dedupes it, so stepping from the block into a topo costs no extra query.
  const block = blockDetail(() => blockId)
  const topos = blockTopoList(() => blockId)
  const routes = blockRouteList(() => blockId)

  // The user's tick per route, shown on every row.
  const ascentStatus = userAscentStatus(() => global.user?.id)

  const topo = $derived(topos.data.find((view) => view.id === topoId))

  // Only the routes drawn on this topo, ordered as their lines read left-to-right.
  const topoRoutes = $derived.by(() => {
    if (topo == null) return []
    const drawn = new Set(topo.lines.map((line) => line.routeId))
    return orderRoutesByTopo(
      routes.data.filter((route) => drawn.has(route.id)),
      [topo],
    )
  })

  // Guidebook numbers, from the same left-to-right order the list reads in.
  const routeNumber = $derived(new Map(topoRoutes.map((route, index) => [route.id, index + 1])))

  // The Topo binds the *line* id (`topo_routes` row); the list works in route ids.
  let highlightId = $state<number>()
  const selectedRouteId = $derived(topo?.lines.find((line) => line.id === highlightId)?.routeId)

  // Arriving with ?route=<id> (route detail page link) lights that route's line.
  // Keyed to the param, not a one-shot latch, so a fresh deep-link re-applies even
  // when the viewer is already mounted; topo sync (same param) never clobbers the
  // user's own selection.
  let appliedRoute: string | null = null
  $effect(() => {
    const routeParam = page.url.searchParams.get('route')
    if (topo == null || routeParam == null || routeParam === appliedRoute) return
    appliedRoute = routeParam
    highlightId = topo.lines.find((line) => line.routeId === Number(routeParam))?.id
  })

  function toggleRoute(routeId: number) {
    const lineId = topo?.lines.find((line) => line.routeId === routeId)?.id
    highlightId = highlightId === lineId ? undefined : lineId
  }

  // Selecting (from either side) brings the route row into view — without moving
  // the sheet: it stays wherever the user dragged it.
  $effect(() => {
    if (selectedRouteId == null) return
    document.getElementById(`topo-route-${selectedRouteId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })

  let open = $state(true)

  // Region-EDIT maintainers get a jump into the topo editor, opened on this photo.
  const canEditTopos = $derived(block.data != null && canEditTopo(global.userRegions, block.data))
  const editHref = $derived(`${resolve('/(app)/blocks/[id]/topos/edit', { id: String(blockId) })}?topo=${topoId}`)

  const blockHref = $derived(resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(blockId) }))
  const topoHref = (id: number) =>
    resolve('/(app)/(shell)/(explore)/blocks/[id]/topos/[topoId]', { id: String(blockId), topoId: String(id) })

  // Prev/next between the block's topos, rendered by the Panel (mobile pill /
  // desktop footer pager). Topos have no names, so the labels state the direction.
  const nav = $derived.by(() => {
    const base = toSheetNav(
      topos.data.map((view) => ({ id: view.id, name: '' })),
      topoId,
      topoHref,
    )
    return base == null
      ? null
      : { ...base, prev: { ...base.prev, label: m.topo_previous() }, next: { ...base.next, label: m.topo_next() } }
  })

  const breadcrumbArea = $derived(block.data == null ? null : blockBreadcrumbArea(block.data))

  // Panel header, like the (map) sheets: which topo this is, over where it lives
  // (area trail + block — the block joins the crumbs since it isn't the title here).
  $effect(() => {
    const index = topos.data.findIndex((view) => view.id === topoId)
    sheetState.title = index === -1 ? m.topo_alt() : m.topo_position({ position: index + 1, total: topos.data.length })
    sheetState.subtitle = block.data == null ? null : breadcrumb
    sheetState.nav = nav
    return () => (sheetState.nav = null)
  })

  // The page is about the topo: open the mobile sheet low instead of at 0.75.
  // Set synchronously — the Panel below reads it when its sheet initialises.
  sheetState.startingSnap = 0.25
  $effect(() => () => (sheetState.startingSnap = null))

  // Arrow keys walk the route list — and with it the highlighted line on the topo:
  // down/right = next, up/left = previous, wrapping at the ends. Stepping between
  // the block's topos stays on j/l (attached by the Panel).
  function handleArrowKey(event: KeyboardEvent) {
    if (isNavKeyExempt(event)) return

    const step =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0
    if (step === 0 || topoRoutes.length === 0) return

    event.preventDefault()
    const current = topoRoutes.findIndex((route) => route.id === selectedRouteId)
    const next =
      current === -1
        ? topoRoutes[step === 1 ? 0 : topoRoutes.length - 1]
        : topoRoutes[(current + step + topoRoutes.length) % topoRoutes.length]
    highlightId = topo?.lines.find((line) => line.routeId === next.id)?.id
  }
</script>

<svelte:head>
  <title>{block.data?.name ?? m.common_block()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<svelte:window onkeydown={handleArrowKey} />

<!-- The topo is the hero on both form factors: the stage fills the viewport and
     the routes live in the Panel (mobile bottom sheet / desktop right pane). On
     mobile the stage's height tracks the sheet's top edge, so dragging the sheet
     resizes the topo; on desktop it spans nav rail → panel, on the Topo's own
     surface-950 so the contain-fit letterbox bands dissolve into one canvas. -->
<div
  class="bg-surface-950 absolute inset-x-0 top-0 md:right-80 md:left-20 lg:right-96"
  style:height={sheetState.sheetTop == null ? '100%' : `${Math.max(sheetState.sheetTop, 0)}px`}
>
  {#if topo != null}
    <Topo
      class="h-full w-full"
      imagePath={topo.imagePath}
      width={topo.imageWidth}
      height={topo.imageHeight}
      alt={m.topo_alt()}
      interactive
      zoomable
      bind:highlightId
      lines={topo.lines.map((line) => ({
        id: line.id,
        points: line.points,
        band: getGradeBand(line.gradeFk),
        topType: line.topType,
        number: routeNumber.get(line.routeId),
      }))}
    />
  {/if}
</div>

<Panel bind:open onclose={() => goto(blockHref)}>
  <QueryState resource={topos}>
    {#snippet ready()}
      {#if topo == null}
        <ErrorState type="notfound" title={m.topo_alt()} />
      {:else}
        {#if canEditTopos}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- editHref is resolve() + ?topo query. -->
          <a class="btn preset-outlined-surface-200-800 mb-2 h-11 w-full" href={editHref}>
            <Icon name="image" size={15} />
            {m.topo_editTopos()}
          </a>
        {/if}
        <nav class="flex flex-col gap-1.5">
          {#each topoRoutes as route (route.id)}
            <div id="topo-route-{route.id}">
              <RouteRow
                {route}
                active={route.id === selectedRouteId}
                grade={gradeLabel(global.grades, global.gradingScale, route.gradeFk)}
                number={routeNumber.get(route.id)}
                status={ascentStatus.get(route.id)}
                mapHref={blockHref}
                detailsHref={resolve('/(app)/routes/[id]', { id: String(route.id) })}
                onclick={() => toggleRoute(route.id)}
              />
            </div>
          {/each}
        </nav>
      {/if}
    {/snippet}

    {#snippet empty()}
      <ErrorState type="notfound" title={m.topo_alt()} />
    {/snippet}
  </QueryState>
</Panel>

{#snippet breadcrumb()}
  {#if block.data != null}
    <div class="flex min-w-0 items-center gap-2 text-xs whitespace-nowrap">
      {#if breadcrumbArea != null && block.data.areas.length > 0}
        <!-- min-w-0 lets the trail shrink so the Breadcrumb's own hidden-scrollbar
             overflow takes over; the block crumb stays visible (shrink-0). -->
        <div class="min-w-0">
          <Breadcrumb area={breadcrumbArea} userRegions={global.userRegions} />
        </div>
        <span class="shrink-0">·</span>
      {/if}

      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- blockHref is pre-resolved above. -->
      <a class="anchor shrink-0" href={blockHref}>{block.data.name}</a>
    </div>
  {/if}
{/snippet}
