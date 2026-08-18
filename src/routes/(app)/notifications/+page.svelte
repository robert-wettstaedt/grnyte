<!--
  The inbox: the things aimed at this person, and nothing else.

  Deliberately not a second feed. Region activity is already on screen in the feed, grouped and
  hydrated; what lands here is a mention, somebody touching your ascent, a role change or an
  invitation you sent being accepted. That is also what the badge counts, so a badge full of crag
  edits can never train anybody to ignore it.
-->
<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import HydratedRow from '$lib/components/EntityRow/HydratedRow.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import PushSetup from '$lib/components/PushSetup/PushSetup.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import type { CardRow } from '$lib/entities/event/cardView'
  import type { EventEntityRef } from '$lib/entities/event/entity'
  import { notificationView } from '$lib/entities/notification/caption'
  import type { NotificationListItem } from '$lib/entities/notification/dto'
  import { markNotificationsRead } from '$lib/entities/notification/notifications.remote'
  import { notificationList } from '$lib/entities/notification/resources.svelte'
  import { regionCrumb } from '$lib/entities/region/mapper'
  import { resolveMessage } from '$lib/i18n/message'
  import { calendarDay, formatDay, formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { now } from '$lib/state/now.svelte'
  import { onMount } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'

  const global = getGlobalState()

  // The regions are handed in rather than read inside the resource: the badge builds the same
  // resource from `setGlobalState`, where the context does not exist yet. See `notificationList`.
  const notifications = notificationList(undefined, () => global.userRegions)

  /**
   * Which rows were unread when the reader got here.
   *
   * Accumulating rather than reading `readAt` straight off the row: mounting stamps the whole
   * inbox read, so by the second frame every row claims to have been read and the reader is left
   * watching the badge drop with nothing on screen having changed. Ids are only ever added, so a
   * row that arrives while the page is open joins them too.
   */
  const arrivedUnread = new SvelteSet<number>()

  const views = $derived(
    notifications.data.map((notification) => ({ notification, view: notificationView(notification) })),
  )

  // Local calendar day, exactly as the feed's dividers. See `calendarDay`.

  // Same day dividers as the feed, decided the same way: a flat sequence with a flag on the first
  // row of each day, rather than nested per-day arrays.
  const rows = $derived(
    views.map((entry, index) => ({
      ...entry,
      day: calendarDay(entry.notification.createdAt),
      startsDay:
        index === 0 ||
        calendarDay(views[index - 1].notification.createdAt) !== calendarDay(entry.notification.createdAt),
    })),
  )

  $effect(() => {
    for (const { notification } of views) {
      if (notification.readAt == null) {
        arrivedUnread.add(notification.id)
      }
    }
  })

  /**
   * The notification's own object, in the shared row's vocabulary.
   *
   * The entity arrives nested with the row now, so there is no waiting and no third state: it is
   * either here or it is gone. A row whose object was already deleted when the typed columns were
   * backfilled has no ref at all and draws nothing (see `notificationView`).
   */
  const rowFor = (notification: NotificationListItem, ref: EventEntityRef): CardRow => ({
    // Neither on an inbox row. The strip and the note are what a feed card says ABOUT an ascent it
    // is reporting; a notification is one line telling you it happened, and the ascent's own
    // screen is one tap away.
    ascent: undefined,
    entity: notification.entity,
    // Unlike an event, a notification stores no fallback name for its subject, so a tombstone here
    // can only say what kind of thing is missing.
    name: undefined,
    note: undefined,
    ref,
    state: notification.entity == null ? 'tombstone' : 'entity',
  })

  // Opening the inbox is the act of reading it, so the whole thing is stamped once, here, rather
  // than per row. `onMount` and not an `$effect` on the list: re-stamping whenever the list
  // changed would write again on every arrival while the reader is still on the page.
  // Swallowed on failure: the badge staying up is the safe way round, and there is nothing
  // useful to tell the reader about it.
  onMount(() => {
    void markNotificationsRead().catch(() => undefined)
  })
</script>

<svelte:head>
  <title>{m.notifications_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<main class="relative min-w-0 flex-1 overflow-y-auto">
  <PageHeader onback={() => back(resolve('/(app)/(shell)/feed'))} title={m.notifications_title()} />

  <div class="container mx-auto max-w-3xl space-y-2 px-4 py-6 pb-24 md:pb-8">
    <!-- The ask, on the screen where somebody has just come looking for what they missed. Retires
         itself once permission is granted or once dismissed, and shares that dismissal with every
         other surface that offers it. -->
    <PushSetup dismissible />

    <QueryState resource={notifications}>
      {#snippet ready()}
        <div class="space-y-2">
          {#each rows as { day, notification, startsDay, view } (notification.id)}
            {#if startsDay}
              <h2 class="text-surface-600-400 px-1 pt-1 text-xs font-bold tracking-wide uppercase">
                {formatDay(day, now(), getLocale())}
              </h2>
            {/if}

            {@const crumb = regionCrumb(global.userRegions, notification.regionFk)}

            <article
              class={[
                'space-y-2 rounded-2xl border p-3',
                arrivedUnread.has(notification.id)
                  ? 'border-primary-500/40 bg-primary-500/5'
                  : 'border-surface-200-800 bg-surface-100-900',
              ]}
            >
              <!-- The feed's header, in the same order and the same sizes: who, what, when. Every
                   sentence here starts with the actor, so the face that goes with the name belongs
                   on the row as much as it does on a card. -->
              <header class="flex items-center gap-2.5">
                <Avatar name={notification.actorName} size={34} solid loading={notification.actorName.length === 0} />

                <div class="min-w-0 flex-1">
                  <p class="text-surface-950-50 text-sm/snug font-semibold">
                    {resolveMessage(view.key, view.params)}
                  </p>

                  <!-- Which community this happened in, on the sub line the feed uses for the
                       same job. Only for a row with nothing to hydrate: an entity row carries the
                       region in its own crumbs. Silent for a single-region member through
                       `regionCrumb`, who has nothing to disambiguate. -->
                  {#if view.ref == null && crumb != null}
                    <p class="text-surface-600-400 mt-0.5 text-xs">{crumb}</p>
                  {/if}
                </div>

                <time
                  class="text-surface-600-400 flex-none text-xs whitespace-nowrap"
                  datetime={new Date(notification.createdAt).toISOString()}
                >
                  {formatUploadedAt(notification.createdAt, now(), getLocale())}
                </time>
              </header>

              {#if view.ref != null}
                <HydratedRow row={rowFor(notification, view.ref)} />
              {/if}
            </article>
          {/each}
        </div>
      {/snippet}

      {#snippet empty()}
        <!-- An empty inbox is the normal state, not a failure, so it says what will land here and
             then hands back the screen the reader came from. Without the link this route is a
             dead end: it carries no nav of its own, and the back arrow is above the fold. -->
        <div class="space-y-1 py-10 text-center">
          <span
            class="bg-surface-200-800 text-surface-600-400 mx-auto mb-3 grid size-14 place-items-center rounded-2xl"
          >
            <Icon name="bell" size={24} />
          </span>

          <p class="text-surface-950-50 font-semibold">{m.notifications_empty()}</p>
          <p class="text-surface-600-400 text-sm">{m.notifications_emptyBody()}</p>

          <a class="btn preset-tonal-surface mt-3" href={resolve('/(app)/(shell)/feed')}>
            {m.notifications_emptyAction()}
          </a>
        </div>
      {/snippet}
    </QueryState>
  </div>
</main>
