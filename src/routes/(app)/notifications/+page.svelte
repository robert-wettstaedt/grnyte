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
  import { notificationList } from '$lib/entities/notification/resources.svelte'
  import { markNotificationsRead } from '$lib/entities/notification/writes'
  import { calendarDay, formatDay } from '$lib/i18n/relativeTime'
  import { reportIfOnline } from '$lib/logging/report'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { now } from '$lib/state/now.svelte'
  import { syncCaughtUp } from '$lib/zero/source.svelte'
  import { onDestroy } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'

  const global = getGlobalState()

  const notifications = notificationList(() => global.userRegions)

  /** Rows ever seen unread on this visit: the visit's mark reads them all, and they must stay new. */
  const arrivedUnread = new SvelteSet<number>()

  const rows = $derived(
    notifications.data.map((notification, index, all) => ({
      day: calendarDay(notification.createdAt),
      notification,
      startsDay: index === 0 || calendarDay(all[index - 1].createdAt) !== calendarDay(notification.createdAt),
    })),
  )

  $effect(() => {
    for (const notification of notifications.data) {
      if (notification.readAt == null) {
        arrivedUnread.add(notification.id)
      }
    }
  })

  let marked = false
  const mark = () => {
    marked = true
    void markNotificationsRead(global.user?.id).catch(reportIfOnline)
  }

  $effect(() => {
    const { kind } = notifications.phase
    // `arriving` is enough to read; `syncCaughtUp`, as Zero's reopened rows may be last session's.
    if (!marked && (kind === 'answered' || kind === 'arriving') && syncCaughtUp() && global.user != null) mark()
  })

  onDestroy(() => {
    if (!marked) mark()
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
