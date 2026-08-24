<!--
  One event, on a page of its own, with its thread under it.

  What a notification links to: the exact comment or event it was about, not just the route or
  area the card happened to be on, so the reader lands where the conversation is instead of
  scrolling a feed sheet, behind however many days, inside a sheet that has no URL.
  `notifications.event_fk` and `reaction_fk` exist for exactly this.

  Outside `(shell)`, so it carries no nav rail and no tab bar. It is a screen you arrive at from
  somewhere specific (a notification, a card) and leave by going back, exactly like the topo viewer
  and the editors under `areas/`; the tab bar would offer three ways out of a conversation and
  cover the composer with the third.

  The thread renders in flow rather than in the sheet the feed opens: this screen is already about
  this one event, so a second surface over it would only be something else to dismiss, and
  `?comment=<id>` needs a comment that is on the page to scroll to.
-->
<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import EventCard from '$lib/components/EventFeed/EventCard.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import CommentComposer from '$lib/components/Reactions/CommentComposer.svelte'
  import Comments from '$lib/components/Reactions/Comments.svelte'
  import { createThread } from '$lib/components/Reactions/thread.svelte'
  import { eventCard } from '$lib/entities/event/card'
  import { groupEvents } from '$lib/entities/event/grouping'
  import { eventList } from '$lib/entities/event/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

  const global = getGlobalState()

  // Digits only, the same grammar the feed reads its filter ids with: anything else is not an id,
  // and `Number('')` is 0, which would query for an event nobody has.
  const eventId = $derived(/^\d+$/.test(page.params.id ?? '') ? Number(page.params.id) : 0)
  const highlightId = $derived.by(() => {
    const value = page.url.searchParams.get('comment')
    return value != null && /^\d+$/.test(value) ? Number(value) : undefined
  })

  // The feed's own query, narrowed to one row. Grouped and decided exactly as it is there, so the
  // card reads identically to the one the reader would have found by scrolling.
  const events = eventList(() => ({ ids: [eventId], limit: 1 }))
  const views = $derived(groupEvents(events.data).map((group) => eventCard(group, global.user?.id)))

  const event = $derived(events.data[0])

  // Held by the page rather than by a thread component, because the two halves are split across
  // the scroll area and the pinned footer: the list and the composer have to be the same thread.
  // `regionFk` off the event row, which is the same place the card reads it: 0 until it syncs, and
  // the composer that needs it only renders once it has.
  const thread = createThread(() => ({ eventId, regionFk: event?.regionFk ?? 0 }), { highlight: () => highlightId })
</script>

<svelte:head>
  <title>{m.comments_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<!-- A column that owns the viewport: header, one scrolling middle, composer pinned to the bottom
     edge. The composer is the reason. In a page that scrolls as one, writing four lines pushes the
     box off the bottom of the screen, so the reader is typing into something they cannot see; and
     a thread is read upward from the newest, which is exactly where the box has to stay. -->
<main class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <PageHeader onback={() => back(resolve('/(app)/(shell)/feed'))} title={m.feed_title()} />

  <!-- `QueryState` wraps its ready state in a `min-h-full` column, and `full` is 100% of whatever
       it is inside. Directly under `main` that resolved to the WHOLE viewport, which the header
       above it then pushed down by its own height, putting the pinned composer 17px below the
       fold. This wrapper is what `min-h-full` should measure: the space the header leaves. -->
  <div class="flex min-h-0 flex-1 flex-col">
    <QueryState resource={events}>
      {#snippet ready()}
        {#if views[0] != null && event != null}
          <div class="min-h-0 flex-1 overflow-y-auto">
            <div class="container mx-auto max-w-3xl space-y-5 px-4 py-4">
              <!-- `commentsInline`: the card's own bar keeps its emoji and drops the comment button,
                 because the thread it would open is already on the page underneath it. -->
              <EventCard commentsInline view={views[0]} />

              <section class="space-y-3">
                <!-- A count, not the bare word: this screen exists to show a conversation, and how
                   much of one there is to read is the first thing worth knowing. The rule carries
                   the section break so the heading does not have to be loud to be one. -->
                <h2
                  class="text-surface-600-400 border-surface-200-800 border-b pb-2 text-xs font-bold tracking-wide uppercase"
                >
                  {event.commentCount === 0 ? m.comments_title() : m.comments_show({ count: event.commentCount })}
                </h2>

                <Comments {thread} />
              </section>
            </div>
          </div>

          <!-- Outside the scroll area, so nothing can pass under it and it needs no reserved height:
             the same arrangement `Modal.mobile` uses for the sheet's footer. -->
          <div class="border-surface-200-800 bg-surface-50-950 border-t">
            <div class="container mx-auto max-w-3xl px-4 py-3">
              <CommentComposer {thread} />
            </div>
          </div>
        {/if}
      {/snippet}

      <!-- A deleted event takes its thread with it (`event_fk` cascades), so a link to one is a link
         to something that is really gone rather than something still loading. Also where a reader
         who has left the region lands, since the row simply stops syncing to them. -->
      {#snippet empty()}
        <div class="space-y-1 py-10 text-center">
          <span
            class="bg-surface-200-800 text-surface-600-400 mx-auto mb-3 grid size-14 place-items-center rounded-2xl"
          >
            <Icon name="messageCircle" size={24} />
          </span>

          <p class="text-surface-950-50 font-semibold">{m.event_notFound()}</p>
          <p class="text-surface-600-400 text-sm">{m.event_notFoundBody()}</p>

          <a class="btn preset-tonal-surface mt-3" href={resolve('/(app)/(shell)/feed')}>
            {m.notifications_emptyAction()}
          </a>
        </div>
      {/snippet}
    </QueryState>
  </div>
</main>
