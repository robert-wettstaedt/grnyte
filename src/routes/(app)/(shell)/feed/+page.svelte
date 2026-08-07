<!--
  The global activity feed: everything logged across the regions the user belongs to.

  Markup and the filter values. `activityFeed()` owns the window, the mark behind the "N new"
  pill, the grouping and the hydration; `ActivityFeed` renders the cards it decides.
-->
<script lang="ts">
  import { replaceState } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ActivityFeed from '$lib/components/ActivityFeed/ActivityFeed.svelte'
  import ActivityFilters from '$lib/components/ActivityFeed/ActivityFilters.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import type { ActivityCategory } from '$lib/entities/activity/dto'
  import { activityFeed } from '$lib/entities/activity/feed.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'

  const global = getGlobalState()

  /** Read once, from the URL, so a reloaded or shared feed opens narrowed the way it was left. */
  const initial = page.url.searchParams
  const asNumber = (value: null | string) => {
    const parsed = Number(value)
    return value == null || !Number.isInteger(parsed) ? undefined : parsed
  }

  let category = $state<ActivityCategory | undefined>(
    initial.get('category') === 'ascent' ? 'ascent' : initial.get('category') === 'update' ? 'update' : undefined,
  )
  let regionFk = $state(asNumber(initial.get('region')))
  let userFk = $state(asNumber(initial.get('user')))

  const feed = activityFeed(() => ({ category, regionFk, userFk }))

  const regions = $derived(
    global.userRegions.map((membership) => ({ name: membership.name, regionFk: membership.regionFk })),
  )

  /** The params this page owns. Anything else on the URL is somebody else's and is kept. */
  const OWNED = ['category', 'region', 'user']

  const query = $derived(
    [
      ...[...page.url.searchParams].filter(([key]) => !OWNED.includes(key)),
      ...(
        [
          ['category', category],
          ['region', regionFk],
          ['user', userFk],
        ] as const
      ).flatMap(([key, value]) => (value == null ? [] : [[key, String(value)] as [string, string]])),
    ]
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&'),
  )

  // Mirrored rather than driven: the filters are the state, and the URL follows them so a reload
  // or a shared link lands on the same feed. `replaceState` keeps the back button meaning "the
  // page before this one" rather than "the filter before this one", which is what a chip is for.
  $effect(() => {
    if (query !== page.url.searchParams.toString()) {
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- the path IS resolved; only the query is appended
      replaceState(`${resolve('/(app)/(shell)/feed')}${query.length === 0 ? '' : `?${query}`}`, page.state)
    }
  })
</script>

<svelte:head>
  <title>{m.feed_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="container mx-auto max-w-3xl space-y-4 px-4 py-6 pb-24 md:pb-8">
  <ActivityFilters bind:category currentUserFk={global.user?.id} bind:regionFk {regions} bind:userFk />

  <QueryState resource={feed.resource}>
    {#snippet ready()}
      <ActivityFeed
        expandedIds={feed.expandedIds}
        hasMore={feed.hasMore}
        newCount={feed.newCount}
        onLoadOlder={feed.loadOlder}
        onMergeNew={feed.acknowledge}
        views={feed.views}
      />
    {/snippet}

    {#snippet empty()}
      <div class="space-y-1 py-10 text-center">
        <p class="text-surface-950-50 font-semibold">{m.feed_empty()}</p>
        <p class="text-surface-600-400 text-sm">{m.feed_emptyBody()}</p>
      </div>
    {/snippet}
  </QueryState>
</div>
