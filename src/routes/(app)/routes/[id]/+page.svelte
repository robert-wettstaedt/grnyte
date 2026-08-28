<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Breadcrumb from '$lib/components/Breadcrumb/Breadcrumb.svelte'
  import { trackView } from '$lib/components/EntitySearch/recent.svelte'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import EventMeta from '$lib/components/EventFeed/EventMeta.svelte'
  import GradeHistogram from '$lib/components/GradeHistogram/GradeHistogram.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import InstallApp from '$lib/components/InstallApp/InstallApp.svelte'
  import Markdown from '$lib/components/Markdown/Markdown.svelte'
  import MediaGrid from '$lib/components/Media/MediaGrid.svelte'
  import OfflineNotice from '$lib/components/OfflineNotice/OfflineNotice.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { isNavKeyExempt, toSheetNav } from '$lib/components/SiblingNav/siblingNav'
  import SiblingNav from '$lib/components/SiblingNav/SiblingNav.svelte'
  import Topo from '$lib/components/Topo/Topo.svelte'
  import AscentRow from '$lib/entities/ascent/AscentRow.svelte'
  import { splitAscents } from '$lib/entities/ascent/list'
  import { routeAscentList } from '$lib/entities/ascent/resources.svelte'
  import { blockBreadcrumbArea } from '$lib/entities/block/breadcrumb'
  import { blockDetail, blockRouteList } from '$lib/entities/block/resources.svelte'
  import { routeFileList } from '$lib/entities/file/resources.svelte'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { canEditRoute } from '$lib/entities/route/permissions'
  import { routeDetail } from '$lib/entities/route/resources.svelte'
  import RouteGrade from '$lib/entities/route/RouteGrade.svelte'
  import RouteRating from '$lib/entities/route/RouteRating.svelte'
  import { selectTopoForRoute } from '$lib/entities/topo/mapper'
  import { orderRoutesByTopo } from '$lib/entities/topo/order'
  import { blockTopoList } from '$lib/entities/topo/resources.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { SvelteMap } from 'svelte/reactivity'
  import RegionLive from './RegionLive.svelte'
  import RouteActions from './RouteActions.svelte'

  const global = getGlobalState()

  const routeId = $derived(Number(page.params.id))
  const route = routeDetail(() => routeId)

  trackView('routes', () => route.data?.id)

  // The block frames the page: header breadcrumb, back fallback, and the topos the
  // route is drawn on. `-1` while the route loads is the established idiom.
  const block = blockDetail(() => route.data?.blockFk ?? -1)
  const topos = blockTopoList(() => route.data?.blockFk ?? -1)
  const ascents = routeAscentList(() => routeId)
  const files = routeFileList(() => routeId)

  // Everyone's ascents on this route are deliberately not kept for offline use, so offline this
  // query is incomplete by design and neither the list nor the grade histogram below may be drawn
  // from it. The resource works this out for itself now, including the part this call site kept
  // getting wrong: rows being present offline proves nothing, because your own ascents and anything
  // browsed earlier are seeded into the same table by other preloads.
  //
  // `isComplete` is the deliberate exception to reading availability alone. It survives a
  // disconnect, so a list the server already confirmed stays on screen through a signal blip
  // instead of being replaced by "not available offline" ten seconds in and restored afterwards.
  const ascentsUnavailable = $derived(ascents.availability !== 'ready' && !ascents.isComplete)

  // The most complete drawing of this route across the block's topos.
  const hit = $derived(selectTopoForRoute(topos.data, routeId))

  const blockHref = $derived(
    route.data == null
      ? resolve('/(app)/(shell)/(explore)/(map)/explore')
      : resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(route.data.blockFk) }),
  )

  // The viewer reads ?route= and opens with this route's line lit.
  const topoHref = $derived(
    hit == null || route.data == null
      ? null
      : `${resolve('/(app)/(shell)/(explore)/blocks/[id]/topos/[topoId]', {
          id: String(route.data.blockFk),
          topoId: String(hit.view.id),
        })}?route=${routeId}`,
  )

  // Community grade votes, one per logged ascent that carries an opinion.
  const countByGrade = $derived.by(() => {
    const counts = new SvelteMap<number, number>()
    for (const ascent of ascents.data) {
      if (ascent.gradeFk != null) {
        counts.set(ascent.gradeFk, (counts.get(ascent.gradeFk) ?? 0) + 1)
      }
    }
    return counts
  })
  const voteCount = $derived([...countByGrade.values()].reduce((sum, n) => sum + n, 0))
  // Bar under the pointer while scrubbing the vote histogram, echoed in the header.
  let selectedVote = $state<null | { count: number; label: string }>(null)

  // The route's own media plus beta attached to its ascents, newest upload first.
  const media = $derived(
    [...files.data, ...ascents.data.flatMap((ascent) => ascent.files)].sort((a, b) => b.createdAt - a.createdAt),
  )

  const breadcrumbArea = $derived(block.data == null ? null : blockBreadcrumbArea(block.data))

  // Prev/next through the block's routes, in the same left-to-right order the block
  // and topo pages read them. Routes have no `order` column, so the order is topo-
  // derived; `blockRouteList` rides the queries.block view already loaded for the hero.
  const siblingRoutes = blockRouteList(() => route.data?.blockFk ?? -1)
  const orderedSiblings = $derived(orderRoutesByTopo(siblingRoutes.data, topos.data))
  const routeHref = (id: number) => resolve('/(app)/routes/[id]', { id: String(id) })
  const nav = $derived(toSheetNav(orderedSiblings, routeId, routeHref))

  /** Whether the event log is up. It owns the screen while it is, like the media viewer. */
  let logOpen = $state(false)

  // j / l page to the previous / next sibling, matching the explore sheet pages.
  function handleNavKey(event: KeyboardEvent) {
    if (nav == null || isNavKeyExempt(event)) return
    // The media viewer owns j/l while it's open (it pages media siblings), and so does the
    // event log: paging out from under an open sheet leaves it showing another route's history.
    if (page.url.searchParams.has('media') || logOpen) return
    const href = event.key === 'j' ? nav.prev.href : event.key === 'l' ? nav.next.href : null
    if (href == null) return
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- nav hrefs are resolved in routeHref.
    goto(href)
  }

  const logHref = $derived(resolve('/(app)/routes/[id]/ascents/add', { id: String(routeId) }))
  const ascentsHref = $derived(resolve('/(app)/routes/[id]/ascents', { id: String(routeId) }))

  // Newest first; the signed-in climber's latest ascent is pinned above a short
  // community preview, with the full (filterable) list one tap away.
  const split = $derived(splitAscents(ascents.data, global.user?.id))
  const myAscent = $derived(split.mine[0])
  const previewAscents = $derived(split.community.slice(0, 3))
</script>

<svelte:head>
  <title>{route.data?.name ?? m.common_route()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<svelte:window onkeydown={handleNavKey} />

<QueryState resource={route}>
  {#snippet ready(detail)}
    {@const canEdit = canEditRoute(global.userRegions, detail)}

    <!-- Self-gating: renders nothing unless this is the founder's first route. -->
    <RegionLive regionFk={detail.regionFk} />

    <div class="mx-auto flex min-h-full w-full max-w-screen-sm flex-col">
      <!-- Mirrors the area/block detail headers: back button, the name as the title with
           the entity-type tag beside it, and the containment breadcrumb as the subtitle
           above. Grade + rating sit on the right, aligned like a RouteRow. -->
      <PageHeader onback={() => back(blockHref)}>
        <div class="flex min-w-0 flex-1 flex-col">
          {#if block.data != null}
            <div class="flex min-w-0 items-center gap-2 text-xs whitespace-nowrap">
              {#if breadcrumbArea != null && block.data.areas.length > 0}
                <div class="min-w-0">
                  <Breadcrumb area={breadcrumbArea} userRegions={global.userRegions} />
                </div>
                <span class="shrink-0">·</span>
              {/if}
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- blockHref is pre-resolved above. -->
              <a class="anchor shrink-0" href={blockHref}>{block.data.name}</a>
            </div>
          {/if}

          <div class="flex min-w-0 items-center gap-2">
            <span class="truncate text-base font-bold">{detail.name}</span>
            <span
              class="bg-primary-500/20 text-primary-400 inline-flex h-5.25 flex-none items-center rounded-[7px] px-2 text-[11px] font-bold tracking-[0.02em]"
            >
              {m.common_route()}
            </span>
          </div>
        </div>

        <!-- Both always render (an ungraded/unrated route shows the "—" pill + empty stars). -->
        <div class="flex flex-none flex-col items-end gap-1">
          <RouteGrade
            band={getGradeBand(detail.gradeFk)}
            grade={gradeLabel(global.grades, global.gradingScale, detail.gradeFk)}
          />
          <RouteRating rating={detail.rating} />
        </div>
      </PageHeader>

      <div class="flex flex-col gap-6 px-4 py-5">
        <!-- HERO TOPO — capped height so a portrait topo can't dominate the page. -->
        {#if topoHref != null && hit != null}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- topoHref is pre-resolved above. -->
          <a class="relative block" href={topoHref} aria-label={m.routes_openTopo()}>
            <Topo
              class="max-h-88 w-full"
              imagePath={hit.view.imagePath}
              width={hit.view.imageWidth}
              height={hit.view.imageHeight}
              alt={m.topo_alt()}
              highlightId={hit.line.id}
              lines={hit.view.lines.map((line) => ({
                band: getGradeBand(line.gradeFk),
                id: line.id,
                points: line.points,
                topType: line.topType,
              }))}
            />
            <span
              class="bg-surface-50-950/80 border-surface-200-800 pointer-events-none absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold backdrop-blur"
            >
              {m.routes_openTopo()}
              <Icon name="chevron-right" size={13} />
            </span>
          </a>
        {/if}

        <RouteActions route={detail} block={block.data} />

        {#if detail.tags.length > 0}
          <div class="flex flex-wrap gap-2">
            {#each detail.tags as tag (tag)}
              <span
                class="border-surface-200-800 bg-surface-100-900 text-surface-600-400 inline-flex h-8 items-center rounded-full border px-3.5 text-[13px] font-semibold"
              >
                {tag}
              </span>
            {/each}
          </div>
        {/if}

        <!-- Not `CollapsibleMarkdown`, unlike the area and block pages: a route's description is
             its beta, the thing the screen exists to show, and it sits in a labelled section rather
             than as a lede. Clamping the one paragraph a reader came for behind "show more" would be
             hiding the content under its own heading. -->
        {#if detail.description.trim() !== ''}
          <section class="flex flex-col gap-2.5">
            <h2 class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">
              {m.routes_form_descriptionLabel()}
            </h2>
            <Markdown markdown={detail.description} />
          </section>
        {/if}

        {#if detail.firstAscents.length > 0 || detail.firstAscentYear != null}
          <section class="flex flex-col gap-2.5">
            <h2 class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">{m.routes_form_faLabel()}</h2>
            <div
              class="border-surface-200-800 bg-surface-50-950 flex items-center gap-3 rounded-2xl border px-3.5 py-3"
            >
              {#if detail.firstAscents.length > 0}
                <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {#each detail.firstAscents as fa (fa.name)}
                    <span class="flex items-center gap-2">
                      <Avatar name={fa.name} size={30} solid={fa.userFk != null} />
                      <span class="text-sm font-semibold whitespace-nowrap">{fa.name}</span>
                    </span>
                  {/each}
                </div>

                {#if detail.firstAscentYear != null}
                  <span
                    class="border-surface-200-800 bg-surface-100-900 flex flex-none flex-col items-center rounded-xl border px-3 py-1.5"
                  >
                    <span class="text-surface-500 text-[9px] font-bold tracking-wider uppercase">
                      {m.routes_form_faYearLabel()}
                    </span>
                    <span class="font-mono text-sm font-bold">{detail.firstAscentYear}</span>
                  </span>
                {/if}
              {:else}
                <!-- Year but no named climbers: read it as a plain line, not a lone right pill. -->
                <span class="text-surface-500 text-sm font-semibold">{m.routes_form_faYearLabel()}</span>
                <span class="font-mono text-sm font-bold">{detail.firstAscentYear}</span>
              {/if}
            </div>
          </section>
        {/if}

        {#if ascentsUnavailable}
          <section class="flex flex-col gap-2.5">
            <h2 class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">{m.ascents_title()}</h2>
            <OfflineNotice compact excluded />
          </section>
        {:else if ascents.data.length > 0}
          <section class="flex flex-col gap-2.5">
            <div class="flex items-baseline justify-between gap-3">
              <h2 class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">{m.ascents_title()}</h2>
              <span class="text-surface-500 text-xs font-semibold">{ascents.data.length}</span>
            </div>

            <!-- Row thumbs duplicate the media section below on purpose: they link each
                 file to its ascent, and open the same page-level viewer. -->
            {#if myAscent != null}
              <AscentRow ascent={myAscent} highlight routeName={detail.name} />
            {/if}
            {#each previewAscents as ascent (ascent.id)}
              <AscentRow {ascent} routeName={detail.name} />
            {/each}

            <a class="btn preset-outlined-surface-200-800 w-full" href={ascentsHref}>
              {m.ascents_seeAll({ count: ascents.data.length })}
              <Icon name="chevron-right" size={15} />
            </a>
          </section>
        {/if}

        {#if detail.rawGradeFk != null || countByGrade.size > 0}
          <section class="flex flex-col gap-2.5">
            <div class="flex items-baseline justify-between gap-3">
              <h2 class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">
                {m.routes_gradeOpinions()}
              </h2>
              {#if voteCount > 0}
                <span class="text-surface-500 text-xs font-semibold tabular-nums">
                  {#if selectedVote != null}
                    {selectedVote.label} · {m.routes_gradeVotes({ count: selectedVote.count })}
                  {:else}
                    {m.routes_gradeVotes({ count: voteCount })}
                  {/if}
                </span>
              {/if}
            </div>

            <!-- The route's grade is the grade it was created with; the community's votes
                 (the chart) are what shift the consensus away from it over time. -->
            {#if detail.rawGradeFk != null}
              <div
                class="border-surface-200-800 bg-surface-50-950 flex items-center gap-3 rounded-2xl border px-3.5 py-3"
              >
                <RouteGrade
                  band={getGradeBand(detail.rawGradeFk)}
                  grade={gradeLabel(global.grades, global.gradingScale, detail.rawGradeFk)}
                />
                <span class="text-surface-600-400 text-sm font-semibold">{m.routes_originalGrade()}</span>
              </div>
            {/if}

            <!-- Availability first, rows second. The votes come from everyone's ascents, which are
                 not kept offline, and testing `countByGrade.size` first made this branch
                 unreachable: one locally-held graded ascent drew a "1 vote" consensus directly
                 under the notice saying ascents were unavailable. Neither the chart nor "no
                 opinions" is a claim we can make without the whole list. -->
            {#if ascentsUnavailable}
              <OfflineNotice compact excluded />
            {:else if countByGrade.size > 0}
              <GradeHistogram
                {countByGrade}
                grades={global.grades}
                gradingScale={global.gradingScale}
                showCounts
                onselect={(bar) => (selectedVote = bar)}
              />
            {:else}
              <p class="text-surface-500 text-sm">{m.routes_noOpinions()}</p>
            {/if}
          </section>
        {/if}

        {#if media.length > 0 || canEdit}
          <section class="flex flex-col gap-2.5">
            <h2 class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">
              {m.routes_form_mediaLabel()}
            </h2>
            <MediaGrid
              items={media}
              target={{ id: routeId, type: 'route' }}
              {canEdit}
              shareText={route.data?.name ?? ''}
            />
          </section>
        {/if}

        <!-- No lightbox of its own: this page already mounts one (MediaGrid below), and two
             would both match the same `?media` id and stack two viewers. The log's photos are
             this route's, so the page's set already holds them. -->
        <EventMeta
          createdAt={detail.createdAt}
          createdBy={detail.createdBy}
          lightbox={false}
          bind:open={logOpen}
          scopeId={String(detail.id)}
          scopeType="route"
        />

        <!-- The deepest crag screen, and the one whose content is exactly what goes missing without
             signal, so it is where the offline pitch is concrete rather than abstract. Renders
             nothing on a desktop, in an installed app, or once the nag policy has retired it. -->
        <InstallApp dismissible offline />
      </div>

      <!-- Sticky footer: sibling prev/next pager (like the explore sheets' NavFooter) on the
           left, the always-visible primary action on the right. Footer treatment mirrors the
           app's modal footers (border-t-2, btn-sm). -->
      <footer
        class="border-surface-100-900 bg-surface-50-950 sticky bottom-0 z-10 mt-auto flex items-center justify-between gap-2 border-t-2 px-4 py-3"
      >
        {#if nav != null}
          <div class="flex items-center gap-1.5">
            <SiblingNav {nav} />
          </div>
        {:else}
          <span></span>
        {/if}

        <a class="btn btn-sm preset-filled-primary-500" href={logHref}>
          <Icon name="check" size={16} />
          {m.routes_logAscent()}
        </a>
      </footer>
    </div>
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.routes_notFound()} />
  {/snippet}
</QueryState>
