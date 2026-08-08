<!--
  One entity's audit log, as the sheet behind `ActivityMeta` shows it: the same cards the
  global feed renders, narrowed to the rows written about this record.

  Its own component so the window it opens is tied to the sheet being open. Mounted from
  inside `{#if open}`, `activityFeed()` (a 50-row window plus the six by-id fetches that
  hydrate it) starts when the reader asks for the log, not on every detail page view.
-->
<script lang="ts">
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import type { ActivityFeedFilter } from '$lib/entities/activity/feed.svelte'
  import { activityFeed } from '$lib/entities/activity/feed.svelte'
  import { m } from '$lib/paraglide/messages'
  import ActivityFeed from './ActivityFeed.svelte'

  interface Props {
    /**
     * The record's own "Created ... by ..." line, already resolved. Shown when the log is
     * empty, which is exactly when the entity's own columns are all there is to say: a crag
     * imported before the log existed has no `created` row to render as a card.
     */
    emptyLabel?: string
    /** Whether this log mounts the media viewer. Off where the host page already has one. */
    lightbox?: boolean
    /**
     * Stable across syncs, or the window resets under the reader: `activityFeed` drops its
     * limit and its acknowledged mark whenever the filter changes, and a fresh object literal
     * per Zero emit reads as a change. `ActivityMeta` derives one off primitives for this.
     */
    scope: NonNullable<ActivityFeedFilter['scope']>
  }

  const { emptyLabel, lightbox = true, scope }: Props = $props()

  const feed = activityFeed(() => ({ scope }))
</script>

<QueryState resource={feed.resource}>
  {#snippet ready()}
    <ActivityFeed
      expandedIds={feed.expandedIds}
      hasMore={feed.hasMore}
      {lightbox}
      newCount={feed.newCount}
      onLoadOlder={feed.loadOlder}
      onMergeNew={feed.acknowledge}
      views={feed.views}
    />
  {/snippet}

  {#snippet empty()}
    <div class="space-y-1 py-10 text-center">
      {#if emptyLabel != null}
        <p class="text-surface-950-50 font-semibold">{emptyLabel}</p>
      {/if}
      <p class="text-surface-600-400 text-sm">{m.activity_metaNoChanges()}</p>
    </div>
  {/snippet}
</QueryState>
