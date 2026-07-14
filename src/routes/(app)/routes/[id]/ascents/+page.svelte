<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import MediaLightbox from '$lib/components/Media/MediaLightbox.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import AscentRow from '$lib/entities/ascent/AscentRow.svelte'
  import { ASCENT_TYPES, STATUS } from '$lib/entities/ascent/AscentType.svelte'
  import type { AscentType } from '$lib/entities/ascent/dto'
  import { splitAscents } from '$lib/entities/ascent/list'
  import { routeAscentList } from '$lib/entities/ascent/resources.svelte'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { routeDetail } from '$lib/entities/route/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

  const global = getGlobalState()

  const routeId = $derived(Number(page.params.id))
  const route = routeDetail(() => routeId)
  const ascents = routeAscentList(() => routeId)

  const routeHref = $derived(resolve('/(app)/routes/[id]', { id: String(routeId) }))

  let filter = $state<AscentType | 'all'>('all')

  const countByType = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt wholesale per derivation
    const counts = new Map<AscentType, number>()
    for (const ascent of ascents.data) {
      counts.set(ascent.type, (counts.get(ascent.type) ?? 0) + 1)
    }
    return counts
  })

  // Filter chips: everything, or one ascent type. "All" is just the first chip.
  const chips = $derived([
    { key: 'all' as const, label: m.ascents_filterAll, color: 'var(--color-primary-400)', count: ascents.data.length },
    ...ASCENT_TYPES.map(({ type, label }) => ({
      key: type,
      label,
      color: STATUS[type].color,
      count: countByType.get(type) ?? 0,
    })),
  ])

  const filtered = $derived(ascents.data.filter((ascent) => filter === 'all' || ascent.type === filter))
  const split = $derived(splitAscents(filtered, global.user?.id))

  // Viewer siblings: every row's files, newest upload first, so paging next/prev
  // follows the on-screen row order (rows render newest-first). Unfiltered so an
  // open file survives chip changes.
  const viewerFiles = $derived(ascents.data.flatMap((ascent) => ascent.files).sort((a, b) => b.createdAt - a.createdAt))

  // Deep link from /ascents/[id]: highlight the row and scroll it into view once
  // it has synced in and rendered.
  const targetId = $derived(Number(page.url.searchParams.get('ascent')) || null)
  let scrolledTo = $state<number | null>(null)
  $effect(() => {
    if (targetId == null || scrolledTo === targetId || ascents.data.length === 0) return
    const el = document.getElementById(`ascent-${targetId}`)
    if (el == null) return
    scrolledTo = targetId
    el.scrollIntoView({ block: 'center' })
  })

  const chipStyle = (active: boolean, color: string) =>
    active
      ? `background:color-mix(in oklab, ${color} 20%, transparent); color:${color}; border-color:color-mix(in oklab, ${color} 45%, transparent)`
      : undefined
</script>

<svelte:head>
  <title>{m.ascents_title()} – {route.data?.name ?? m.common_route()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={route}>
  {#snippet ready(detail)}
    <div class="mx-auto flex min-h-full w-full max-w-screen-sm flex-col">
      <PageHeader onback={() => back(routeHref)}>
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="text-base font-bold">{m.ascents_title()}</span>
          <span class="text-surface-600-400 truncate text-xs">
            {detail.name} · {gradeLabel(global.grades, global.gradingScale, detail.gradeFk)} ·
            {m.ascents_count({ count: ascents.data.length })}
          </span>
        </div>

        {#snippet bottom()}
          <!-- Type filter: one horizontally scrollable row of count chips. -->
          <div class="-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5">
            {#each chips as { key, label, color, count } (key)}
              <button
                class={[
                  'border-surface-200-800 flex h-8.5 flex-none items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold',
                  filter !== key && 'bg-surface-100-900 text-surface-600-400',
                ]}
                onclick={() => (filter = key)}
                style={chipStyle(filter === key, color)}
                type="button"
              >
                {label()}
                <span class="font-semibold opacity-65">{count}</span>
              </button>
            {/each}
          </div>
        {/snippet}
      </PageHeader>

      <div class="flex flex-col gap-5 px-4 py-4">
        {#if split.mine.length > 0}
          <section class="flex flex-col gap-2">
            <h2 class="text-primary-400 text-xs font-bold tracking-wider uppercase">{m.ascents_yourLogbook()}</h2>
            {#each split.mine as ascent (ascent.id)}
              <AscentRow
                {ascent}
                expanded={ascent.id === targetId}
                highlight
                id={`ascent-${ascent.id}`}
                routeName={detail.name}
              />
            {/each}
          </section>
        {/if}

        {#if split.community.length > 0}
          <section class="flex flex-col gap-2">
            <h2 class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">
              {m.ascents_community()} · {split.community.length}
            </h2>
            {#each split.community as ascent (ascent.id)}
              <AscentRow
                {ascent}
                expanded={ascent.id === targetId}
                highlight={ascent.id === targetId}
                id={`ascent-${ascent.id}`}
                routeName={detail.name}
              />
            {/each}
          </section>
        {/if}

        {#if filtered.length === 0}
          <p class="text-surface-500 text-sm">{m.ascents_empty()}</p>
        {/if}
      </div>

      <!-- One viewer for every row's thumbs; unfiltered so an open file survives chip changes. -->
      <MediaLightbox items={viewerFiles} shareText={detail.name} />
    </div>
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.routes_notFound()} />
  {/snippet}
</QueryState>
