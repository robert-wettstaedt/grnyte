<!--
  The card list: day dividers, a load-older button and the "N new" pill that holds the
  scroll while fresh rows queue up. Purely presentational — grouping and entity hydration
  happen in the page, so the same component serves the global feed and the per-entity
  activity section.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MediaLightbox from '$lib/components/Media/MediaLightbox.svelte'
  import { activityCard } from '$lib/entities/activity/card'
  import type { ActivityEntityMap } from '$lib/entities/activity/entity'
  import type { ActivityGroup } from '$lib/entities/activity/grouping'
  import type { TopoView } from '$lib/entities/topo/dto'
  import { formatDay } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { now } from '$lib/state/now.svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import ActivityCard from './ActivityCard.svelte'

  interface Props {
    /** The signed-in user, so their own cards read "You". */
    currentUserFk?: number
    /** Hydrated entities keyed by `activityEntityKey`, shared by every card. */
    entities?: ActivityEntityMap
    /**
     * Ids of the cards whose changes are open. Passed in (and mutated in place) rather than
     * kept per card, because the page fetches what only an open card renders. A caller that
     * does not care leaves it alone and gets a set of its own.
     */
    expandedIds?: SvelteSet<string>
    /** Newest first, already folded by `groupActivities`. */
    groups: readonly ActivityGroup[]
    /** Whether the sync window can still grow. */
    hasMore?: boolean
    /** Rows that arrived while the user was reading. Merging stays explicit so the
     *  list never jumps under the cursor. */
    newCount?: number
    onLoadOlder?: () => void
    onMergeNew?: () => void
    /** Topo photos by `topos.id`, for the rows that changed one. */
    topos?: ReadonlyMap<number, TopoView>
  }

  const {
    currentUserFk,
    entities,
    expandedIds = new SvelteSet<string>(),
    groups,
    hasMore = false,
    newCount = 0,
    onLoadOlder,
    onMergeNew,
    topos,
  }: Props = $props()

  /**
   * `createdAt` is a moment, but a divider labels a calendar day. Take the local
   * calendar date and re-express it as a UTC midnight, which is what `formatDay` reads
   * (and what the profile's sessions already key on).
   */
  const dayOf = (timestamp: number) => {
    const date = new Date(timestamp)
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  }

  // Decided once per group and handed down, so a card is markup and the lightbox below
  // reads the same files the cards show rather than walking the hydration map again.
  const views = $derived(groups.map((group) => activityCard(group, entities, currentUserFk, topos)))

  // A divider goes above the first card of each day, so the list stays one flat sequence
  // rather than nested per-day arrays (which would break the "N new" merge at a boundary).
  const rows = $derived(
    views.map((view, index) => {
      const day = dayOf(view.createdAt)
      return { day, startsDay: index === 0 || dayOf(views[index - 1].createdAt) !== day, view }
    }),
  )

  // One viewer for the whole list: mounting a lightbox per card would open several at
  // once on the same `?media` param (see MediaLightbox).
  const files = $derived(views.flatMap((view) => view.files))
</script>

<div class="space-y-3">
  {#if newCount > 0}
    <div class="sticky top-2 z-20 flex justify-center">
      <button type="button" class="btn btn-sm preset-filled-primary-500 rounded-full shadow-lg" onclick={onMergeNew}>
        <Icon name="arrow-up-down" size={14} />
        {m.feed_newActivity({ count: newCount })}
      </button>
    </div>
  {/if}

  {#each rows as { day, startsDay, view } (view.id)}
    {#if startsDay}
      <h2 class="text-surface-600-400 px-1 pt-1 text-xs font-bold tracking-wide uppercase">
        {formatDay(day, now(), getLocale())}
      </h2>
    {/if}

    <ActivityCard {view} onToggle={(open) => (open ? expandedIds.add(view.id) : expandedIds.delete(view.id))} />
  {/each}

  {#if hasMore}
    <button type="button" class="btn preset-tonal-surface w-full" onclick={onLoadOlder}>{m.feed_loadOlder()}</button>
  {/if}
</div>

<MediaLightbox items={files} />
