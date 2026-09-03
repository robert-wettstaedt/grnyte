<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import MediaLightbox from '$lib/components/Media/MediaLightbox.svelte'
  import OfflineNotice from '$lib/components/OfflineNotice/OfflineNotice.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import PushSetup from '$lib/components/PushSetup/PushSetup.svelte'
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
  import { flip } from 'svelte/animate'
  import { fade } from 'svelte/transition'

  const global = getGlobalState()

  const routeId = $derived(Number(page.params.id))
  const route = routeDetail(() => routeId)
  const ascents = routeAscentList(() => routeId)

  const routeHref = $derived(resolve('/(app)/routes/[id]', { id: String(routeId) }))

  // The route itself is preloaded and renders offline; everyone's ascents on it are not kept, and
  // the replica holds whatever fragment other preloads left behind. Every number on this screen is
  // derived from that list: the header tally, the filter chip counts, the "community" heading, and
  // "no ascents yet", so unless the list is trustworthy none of them may be shown. Rendering them
  // anyway said "0 ascents" on a route with fifty, and dropped the community section in silence.
  const ascentsUnavailable = $derived(ascents.availability !== 'ready')

  let filter = $state<'all' | AscentType>('all')

  const countByType = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt wholesale per derivation
    const counts = new Map<AscentType, number>()
    for (const ascent of ascents.data) {
      counts.set(ascent.type, (counts.get(ascent.type) ?? 0) + 1)
    }
    return counts
  })

  // Filter chips: everything, or one ascent type. "All" is only the first chip.
  const chips = $derived([
    { color: 'var(--color-primary-400)', count: ascents.data.length, key: 'all' as const, label: m.ascents_filterAll },
    ...ASCENT_TYPES.map(({ label, type }) => ({
      color: STATUS[type].color,
      count: countByType.get(type) ?? 0,
      key: type,
      label,
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
  let scrolledTo = $state<null | number>(null)
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
          <span class="text-surface-600-400 truncate text-xs">
            {detail.name} · {gradeLabel(global.grades, global.gradingScale, detail.gradeFk)}{ascentsUnavailable
              ? ''
              : ` · ${m.ascents_count({ count: ascents.data.length })}`}
          </span>
          <span class="text-base font-bold">{m.ascents_title()}</span>
        </div>

        {#snippet bottom()}
          <!-- Every chip carries a count off the same list, so they go together with it. -->
          <div class={['-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5', ascentsUnavailable && 'hidden']}>
            {#each chips as { color, count, key, label } (key)}
              <button
                class={[
                  'border-surface-200-800 flex h-8.5 flex-none items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold transition-colors',
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
        {#if ascentsUnavailable}
          <OfflineNotice excluded />
        {:else}
          <!-- This is where logging an ascent lands, so it is the moment somebody has just put
             something into the app and might want to hear when others touch it. Only shown once
             they have an ascent here, and only to somebody who has not answered the ask yet: the
             dismissal flag is shared with every other surface, and the card retires itself once
             permission is granted. -->
          {#if split.mine.length > 0}
            <PushSetup dismissible />

            <section class="flex flex-col gap-2">
              <h2 class="text-primary-400 text-xs font-bold tracking-wider uppercase">{m.ascents_yourLogbook()}</h2>
              {#each split.mine as ascent (ascent.id)}
                <div animate:flip={{ duration: 200 }} transition:fade={{ duration: 150 }}>
                  <AscentRow
                    {ascent}
                    expanded={ascent.id === targetId}
                    highlight
                    id={`ascent-${ascent.id}`}
                    routeName={detail.name}
                  />
                </div>
              {/each}
            </section>
          {/if}

          {#if split.community.length > 0}
            <section class="flex flex-col gap-2">
              <h2 class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">
                {m.ascents_community()} · {split.community.length}
              </h2>
              {#each split.community as ascent (ascent.id)}
                <div animate:flip={{ duration: 200 }} transition:fade={{ duration: 150 }}>
                  <AscentRow
                    {ascent}
                    expanded={ascent.id === targetId}
                    highlight={ascent.id === targetId}
                    id={`ascent-${ascent.id}`}
                    routeName={detail.name}
                  />
                </div>
              {/each}
            </section>
          {/if}

          {#if filtered.length === 0}
            <p class="text-surface-500 text-sm">{m.ascents_empty()}</p>
          {/if}
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
