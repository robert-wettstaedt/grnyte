<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AreaRow from '$lib/components/EntityRow/AreaRow.svelte'
  import BlockRow from '$lib/components/EntityRow/BlockRow.svelte'
  import RouteRow from '$lib/components/EntityRow/RouteRow.svelte'
  import type { AscentStatus } from '$lib/components/EntityRow/types'
  import UserRow from '$lib/components/EntityRow/UserRow.svelte'
  import { entityGroupLabel, entityHref, type EntityType } from '$lib/components/EntitySearch/search.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { areaList } from '$lib/entities/area/resources.svelte'
  import { userAscentStatus } from '$lib/entities/ascent/resources.svelte'
  import { blockList } from '$lib/entities/block/resources.svelte'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { regionCrumb } from '$lib/entities/region/mapper'
  import type { RouteListItem } from '$lib/entities/route/dto'
  import { routeList } from '$lib/entities/route/resources.svelte'
  import { userList } from '$lib/entities/user/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { sheetState } from '../../Modal/sheetState.svelte'
  import { matchScore } from './score'

  const global = getGlobalState()

  // The committed query lives in the URL (the search bar writes it on submit);
  // live typing drives the bar's own dropdown, not this page.
  const query = $derived((page.url.searchParams.get('q') ?? '').trim())
  const enabled = () => query.length > 0

  // Cap per type. ponytail: 20 is plenty to navigate to a known name; refine the
  // query for more rather than paginating a search preview.
  const CAP = 20
  const TOP_K = 5
  const PREVIEW = 5

  // Every region the user belongs to (users need it explicitly; areas/blocks/routes
  // are already region-scoped by RLS). Gated on a non-empty query so nothing runs
  // — and no users sync over the network — until there's something to search.
  const regionFks = () => global.userRegions.map((region) => region.regionFk)

  const areas = areaList(() => ({ content: query, limit: CAP }), { enabled })
  const blocks = blockList(() => ({ content: query, limit: CAP }), { enabled })
  const routes = routeList(() => ({ content: query, pageSize: CAP }), { enabled })
  const users = userList(() => ({ content: query, limit: CAP, regionFks: regionFks() }), {
    enabled: () => enabled() && regionFks().length > 0,
  })

  const ascentStatus = userAscentStatus(() => global.user?.id)

  const crumbsOf = (regionFk: null | number | undefined, rest: Array<null | string | undefined>): string[] =>
    [regionCrumb(global.userRegions, regionFk), ...rest].filter((crumb): crumb is string => crumb != null)

  interface ResultBase {
    crumbs: string[]
    href: string
    id: number
    name: string
    /** Community rating, a within-tier tiebreak (routes only; 0 otherwise). */
    rating: number
    /** Name-match relevance (see {@link matchScore}). */
    score: number
  }

  type Result =
    | (ResultBase & { grade: string; route: RouteListItem; status: AscentStatus | undefined; type: 'routes' })
    | (ResultBase & { topoImagePath?: string; type: 'blocks' })
    | (ResultBase & { type: 'areas' })
    | (ResultBase & { type: 'users' })

  // One flat, scored list built from the four typed sources. Score is computed
  // client-side because `ILIKE` returns no rank and the types are separate
  // queries that can't be ordered against each other server-side.
  const results = $derived.by((): Result[] => {
    const q = query
    const out: Result[] = []

    for (const area of areas.data) {
      out.push({
        crumbs: crumbsOf(area.regionFk, [area.areas.at(-1)?.name]),
        href: entityHref({ id: area.id, label: area.name, type: 'areas' }),
        id: area.id,
        name: area.name,
        rating: 0,
        score: matchScore(area.name, q),
        type: 'areas',
      })
    }

    for (const block of blocks.data) {
      out.push({
        crumbs: crumbsOf(block.regionFk, [block.areas.at(-1)?.name]),
        href: entityHref({ id: block.id, label: block.name, type: 'blocks' }),
        id: block.id,
        name: block.name,
        rating: 0,
        score: matchScore(block.name, q),
        topoImagePath: block.topoImages[0]?.path,
        type: 'blocks',
      })
    }

    for (const route of routes.data) {
      out.push({
        crumbs: crumbsOf(route.regionFk, [route.areaName, route.blockName]),
        grade: gradeLabel(global.grades, global.gradingScale, route.gradeFk),
        href: entityHref({ id: route.id, label: route.name, type: 'routes' }),
        id: route.id,
        name: route.name,
        rating: route.rating,
        route,
        // Score the raw name — for an unnamed route it's empty, so a description-only
        // hit can't spuriously match the `common_unnamed` placeholder text.
        score: matchScore(route.rawName ?? route.name, q),
        status: ascentStatus.get(route.id),
        type: 'routes',
      })
    }

    for (const user of users.data) {
      out.push({
        // A person has no geographic breadcrumb (region membership would read like a
        // location path, which is confusing), so the row is just the avatar + name.
        crumbs: [],
        href: entityHref({ id: user.id, label: user.username, type: 'users' }),
        id: user.id,
        name: user.username,
        rating: 0,
        score: matchScore(user.username, q),
        type: 'users',
      })
    }

    return out
  })

  // Rating only tiebreaks *within* a type (it's routes-only, 0 elsewhere), so it
  // never biases the mixed top strip toward routes on an equal-name tie.
  const byRelevance = (a: Result, b: Result): number =>
    b.score - a.score ||
    (a.type === b.type ? b.rating - a.rating : 0) ||
    a.name.length - b.name.length ||
    a.name.localeCompare(b.name)

  const GROUP_ORDER: EntityType[] = ['areas', 'blocks', 'routes', 'users']

  const grouped = $derived(
    GROUP_ORDER.map((type) => ({
      items: results.filter((result) => result.type === type).sort(byRelevance),
      type,
    })).filter((group) => group.items.length > 0),
  )

  // Best-first across every type. Only a real name hit (score > 0) earns a top
  // slot — a description-only route match still lists in its group, just low.
  const topHits = $derived(
    results
      .filter((result) => result.score > 0)
      .sort(byRelevance)
      .slice(0, TOP_K),
  )

  // The strip only pays its way when more than one type matched — that's exactly
  // the "scroll past the first group to reach the next" case. A single type is
  // already best-first in its own section.
  const showTop = $derived(grouped.length > 1 && topHits.length > 0)

  const anyLoading = $derived([areas, blocks, routes, users].some((resource) => resource.status === 'loading'))

  let expanded = $state<Partial<Record<EntityType, boolean>>>({})

  // The shared Modal renders its header from sheetState — label it with the query.
  $effect(() => {
    sheetState.title = query.length === 0 ? m.common_search() : query
  })
</script>

<svelte:head>
  <title>{query.length === 0 ? m.common_search() : query} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#snippet resultRow(item: Result)}
  {#if item.type === 'routes'}
    <RouteRow route={item.route} grade={item.grade} status={item.status} crumbs={item.crumbs} href={item.href} />
  {:else if item.type === 'blocks'}
    <BlockRow name={item.name} crumbs={item.crumbs} topoImagePath={item.topoImagePath} href={item.href} />
  {:else if item.type === 'users'}
    <UserRow name={item.name} crumbs={item.crumbs} href={item.href} />
  {:else}
    <AreaRow name={item.name} crumbs={item.crumbs} href={item.href} />
  {/if}
{/snippet}

{#if query.length === 0}
  <p class="text-surface-500 py-10 text-center text-sm">{m.search_hint()}</p>
{:else if results.length === 0 && anyLoading}
  <div class="space-y-3 py-4" aria-busy="true">
    <div class="placeholder animate-pulse"></div>
    <div class="placeholder animate-pulse"></div>
    <div class="placeholder animate-pulse"></div>
  </div>
{:else if results.length === 0}
  <p class="text-surface-500 py-10 text-center text-sm">{m.search_noResults({ query })}</p>
{:else}
  <div class="flex flex-col gap-5">
    {#if showTop}
      <section class="space-y-2">
        <h2 class="text-surface-600-400 text-sm font-bold tracking-wider uppercase">{m.search_topResults()}</h2>
        <nav class="flex flex-col gap-2">
          {#each topHits as item (item.type + '-' + item.id)}
            {@render resultRow(item)}
          {/each}
        </nav>
      </section>
    {/if}

    {#each grouped as group (group.type)}
      {@const showAll = expanded[group.type] === true}
      {@const visible = showAll ? group.items : group.items.slice(0, PREVIEW)}
      <section class="space-y-2">
        <h2 class="text-surface-600-400 text-sm font-bold tracking-wider uppercase">
          {entityGroupLabel(group.type)}
        </h2>

        <nav class="flex flex-col gap-2">
          {#each visible as item (item.type + '-' + item.id)}
            {@render resultRow(item)}
          {/each}
        </nav>

        {#if !showAll && group.items.length > PREVIEW}
          <button
            type="button"
            class="text-primary-500 hover:text-primary-400 flex items-center gap-1 px-1 py-1 text-sm font-semibold"
            onclick={() => (expanded = { ...expanded, [group.type]: true })}
          >
            {m.search_showAll({ count: group.items.length })}
            <Icon name="chevron-down" size={15} strokeWidth={2.2} />
          </button>
        {/if}
      </section>
    {/each}
  </div>
{/if}
