<!--
  The global activity feed: everything logged across the regions the user belongs to.

  The page owns the window (how many rows are synced), the grouping and the entity
  hydration; `ActivityFeed` is the markup for the result. Filters are the next phase, so
  this is the unfiltered "All" view.
-->
<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ActivityFeed from '$lib/components/ActivityFeed/ActivityFeed.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { groupActivities } from '$lib/entities/activity/grouping'
  import { activityEntities } from '$lib/entities/activity/hydrate.svelte'
  import { activityList } from '$lib/entities/activity/resources.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { SvelteSet } from 'svelte/reactivity'

  const global = getGlobalState()

  /** Sync window, and what one "load older" tap adds to it. It also caps the pill's count:
   *  past a page of unread rows the number stops being worth the rows it would sync. */
  const PAGE_SIZE = 50

  let limit = $state(PAGE_SIZE)
  /** Id of the newest activity the reader has acknowledged. Anything above it waits. */
  let seen = $state<number>()

  // Two windows either side of the mark rather than one filtered list: rows that arrive while
  // reading would push the list down under the cursor, and if they merely counted against
  // `limit` they would also push an equal number of old rows off the bottom.
  const activities = activityList(() => ({ limit, upToId: seen }))
  const incoming = activityList(() => ({ afterId: seen, limit: PAGE_SIZE }), { enabled: () => seen != null })

  const newCount = $derived(incoming.data.length)

  const groups = $derived(groupActivities(activities.data))

  // Which cards are open, and with them the only rows worth fetching a topo photo for: the
  // change list behind the toggle is the one thing that draws one.
  const expandedIds = new SvelteSet<string>()
  const expandedActivities = $derived(
    groups.filter((group) => expandedIds.has(group.id)).flatMap((group) => group.activities),
  )

  const hydration = activityEntities(
    () => activities.data,
    () => expandedActivities,
  )

  // Zero hands back at most `limit` rows, so a full window is the only signal that there
  // are older ones. A window that comes back short is the end of the log.
  const hasMore = $derived(activities.data.length >= limit)

  const acknowledge = () => (seen = incoming.data[0]?.id ?? activities.data[0]?.id)

  // The first window is what the reader opened the page to, so it counts as read; only what
  // lands after that queues behind the pill. A one-time capture, so it cannot be `$derived`:
  // a mark that kept following the newest row would never hold anything back.
  $effect(() => {
    if (seen == null && activities.data.length > 0) {
      acknowledge()
    }
  })
</script>

<svelte:head>
  <title>{m.feed_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="container mx-auto max-w-3xl space-y-4 px-4 py-6 pb-24 md:pb-8">
  <h1 class="text-surface-950-50 text-2xl font-bold tracking-tight">{m.feed_title()}</h1>

  <QueryState resource={activities}>
    {#snippet ready()}
      <ActivityFeed
        currentUserFk={global.user?.id}
        entities={hydration.entities}
        {expandedIds}
        {groups}
        {hasMore}
        {newCount}
        onLoadOlder={() => (limit += PAGE_SIZE)}
        onMergeNew={acknowledge}
        topos={hydration.topos}
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
