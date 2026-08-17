<!--
  The card list: day dividers, a load-older button and the "N new" pill that holds the
  scroll while fresh rows queue up.

  Markup over decided cards. The window, the mark behind the pill, the grouping and the
  hydration are `eventFeed()`, so the same component serves the global feed and any
  scoped one.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MediaLightbox from '$lib/components/Media/MediaLightbox.svelte'
  import type { EventCardView } from '$lib/entities/event/card'
  import { calendarDay, formatDay } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { now } from '$lib/state/now.svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import EventCard from './EventCard.svelte'

  interface Props {
    /**
     * Ids of the cards whose changes are open. Passed in (and mutated in place) rather than
     * kept per card, because the feed fetches what only an open card renders. A caller that
     * does not care leaves it alone and gets a set of its own.
     */
    expandedIds?: SvelteSet<string>
    /** Whether the sync window can still grow. */
    hasMore?: boolean
    /**
     * Whether this feed mounts the viewer its thumbnails open. Off for a feed rendered onto a
     * page that already has one: both would match the same `?media` id and stack two viewers
     * (see MediaLightbox), and on such a page the file is in the page's own set anyway.
     */
    lightbox?: boolean
    /** Rows that arrived while the user was reading. Merging stays explicit so the
     *  list never jumps under the cursor. */
    newCount?: number
    onLoadOlder?: () => void
    onMergeNew?: () => void
    /** The cards, newest first, already decided by `cardView`. */
    views: readonly EventCardView[]
  }

  const {
    expandedIds = new SvelteSet<string>(),
    hasMore = false,
    lightbox = true,
    newCount = 0,
    onLoadOlder,
    onMergeNew,
    views,
  }: Props = $props()

  // `createdAt` is a moment, but a divider labels a calendar day. See `calendarDay`.

  // A divider goes above the first card of each day, so the list stays one flat sequence
  // rather than nested per-day arrays (which would break the "N new" merge at a boundary).
  const rows = $derived(
    views.map((view, index) => {
      const day = calendarDay(view.createdAt)
      return { day, startsDay: index === 0 || calendarDay(views[index - 1].createdAt) !== day, view }
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

    <EventCard {view} onToggle={(open) => (open ? expandedIds.add(view.id) : expandedIds.delete(view.id))} />
  {/each}

  {#if hasMore}
    <button type="button" class="btn preset-tonal-surface w-full" onclick={onLoadOlder}>{m.feed_loadOlder()}</button>
  {/if}
</div>

{#if lightbox}
  <MediaLightbox items={files} />
{/if}
