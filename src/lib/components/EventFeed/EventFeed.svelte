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

  /**
   * Cards that render normally before `content-visibility: auto` takes over below.
   *
   * Roughly a phone screenful. The first cards are on screen anyway, so skipping their layout and
   * paint would buy nothing and only risks the browser measuring them at the placeholder size for
   * one frame.
   */
  const EAGER_CARDS = 6
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

  {#each rows as { day, startsDay, view }, index (view.id)}
    {#if startsDay}
      <h2 class="text-surface-600-400 px-1 pt-1 text-xs font-bold tracking-wide uppercase">
        {formatDay(day, now(), getLocale())}
      </h2>
    {/if}

    <!-- The card swaps its own compact row for its full self, and for the length of that swap both
         halves are in the DOM. Unwrapped they would be two children of `space-y-3` for 150ms, so
         everything below would jerk down by a gap and back up again. One wrapper, one gap.

         Off screen, that same wrapper is also where the feed stops paying for cards nobody is
         looking at: a synced window opens at 50 rows and only grows from there (`load older` adds
         another 50 and nothing prunes the old ones), so everything past the first screenful skips
         layout and paint until it scrolls near.

         Two things this leans on. `content-visibility: auto` implies `contain: layout paint style`,
         which makes each wrapper a containing block and a stacking context, so it is only safe
         because every overlay a card can open (the lightbox, the reaction sheet) portals out of the
         list; keep it that way. And the intrinsic size MUST keep its `auto` keyword: the card grows
         when it expands, and without `auto` remembering the size it last rendered at, an expanded
         card that scrolled away would come back at the placeholder height and yank the scroll
         position. The one cost: Safari 18.0 to 18.6 does not find skipped content with find-in-page
         (fixed in 26), so on those a browser search misses cards below the fold. -->
    <div class={index >= EAGER_CARDS ? '[contain-intrinsic-size:auto_11rem] [content-visibility:auto]' : undefined}>
      <EventCard {view} onToggle={(open) => (open ? expandedIds.add(view.id) : expandedIds.delete(view.id))} />
    </div>
  {/each}

  {#if hasMore}
    <button type="button" class="btn preset-tonal-surface w-full" onclick={onLoadOlder}>{m.feed_loadOlder()}</button>
  {/if}
</div>

{#if lightbox}
  <MediaLightbox items={files} />
{/if}
