<!--
  The inbox: the things aimed at this person, and nothing else.

  Deliberately not a second feed. Region activity is already on screen in the feed, grouped and
  hydrated; what lands here is a mention, somebody touching your ascent, a role change or an
  invitation you sent being accepted. That is also what the badge counts, so a badge full of sector
  edits can never train anybody to ignore it.
-->
<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import PushSetup from '$lib/components/PushSetup/PushSetup.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import NotificationRow from '$lib/entities/notification/NotificationRow.svelte'
  import { markNotificationsRead } from '$lib/entities/notification/notifications.remote'
  import { notificationList } from '$lib/entities/notification/resources.svelte'
  import { calendarDay, formatDay } from '$lib/i18n/relativeTime'
  import { reportIfOnline } from '$lib/logging/report'
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

  const views = $derived(notifications.data.map((notification) => ({ notification })))

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

  // Opening the inbox is the act of reading it, so the whole thing is stamped once, here, rather
  // than per row. `onMount` and not an `$effect` on the list: re-stamping whenever the list
  // changed would write again on every arrival while the reader is still on the page.
  // Not shown to the reader, who has nothing to do about it, but recorded: a badge that will not
  // clear is otherwise a report with nothing behind it.
  onMount(() => {
    void markNotificationsRead().catch(reportIfOnline)
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
          {#each rows as { day, notification, startsDay } (notification.id)}
            {#if startsDay}
              <h2 class="text-surface-600-400 px-1 pt-1 text-xs font-bold tracking-wide uppercase">
                {formatDay(day, now(), getLocale())}
              </h2>
            {/if}

            <NotificationRow {notification} unread={arrivedUnread.has(notification.id)} />
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
