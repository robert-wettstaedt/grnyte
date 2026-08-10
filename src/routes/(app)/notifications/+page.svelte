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
  import HydratedRow from '$lib/components/EntityRow/HydratedRow.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import type { ActivityCardRow } from '$lib/entities/activity/card'
  import { activityEntityKey, type ActivityEntityRef } from '$lib/entities/activity/entity'
  import { hydrateEntities } from '$lib/entities/activity/hydrate.svelte'
  import { notificationView } from '$lib/entities/notification/caption'
  import { markNotificationsRead } from '$lib/entities/notification/notifications.remote'
  import { notificationList } from '$lib/entities/notification/resources.svelte'
  import { resolveMessage } from '$lib/i18n/message'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { regionCrumb } from '$lib/entities/region/mapper'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { now } from '$lib/state/now.svelte'
  import { onMount } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'

  const global = getGlobalState()

  const notifications = notificationList()

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

  // The same second pass the feed makes, for the same reason: `entityId` is polymorphic text, so
  // Zero cannot join a row to the thing it is about. A role change contributes no ref: its
  // subject is the reader, so the row would be their own name.
  const hydration = hydrateEntities(() => views.flatMap((entry) => (entry.view.ref == null ? [] : [entry.view.ref])))

  $effect(() => {
    for (const { notification } of views) {
      if (notification.readAt == null) {
        arrivedUnread.add(notification.id)
      }
    }
  })

  /** A hydrated ref in the shared row's own vocabulary: still syncing, gone, or there. */
  const rowFor = (ref: ActivityEntityRef): ActivityCardRow => {
    const entity = hydration.entities.get(activityEntityKey(ref))
    return {
      entity: entity ?? undefined,
      // Unlike an activity row, a notification stores no fallback name for its subject, so a
      // tombstone here can only say what kind of thing is missing.
      name: undefined,
      ref,
      state: entity === undefined ? 'skeleton' : entity === null ? 'tombstone' : 'entity',
    }
  }

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
    <QueryState resource={notifications}>
      {#snippet ready()}
        {#each views as { notification, view } (notification.id)}
          <article
            class={[
              'space-y-1 rounded-2xl border p-3',
              arrivedUnread.has(notification.id)
                ? 'border-primary-500/40 bg-primary-500/5'
                : 'border-surface-200-800 bg-surface-100-900',
            ]}
          >
            <div class="flex items-baseline gap-2">
              <p class="text-surface-950-50 min-w-0 flex-1 text-sm font-semibold">
                {resolveMessage(view.key, view.params)}
              </p>

              <time
                class="text-surface-600-400 flex-none text-xs"
                datetime={new Date(notification.createdAt).toISOString()}
              >
                {formatUploadedAt(notification.createdAt, now(), getLocale())}
              </time>
            </div>

            {#if view.ref != null}
              <HydratedRow row={rowFor(view.ref)} />
            {:else if regionCrumb(global.userRegions, notification.regionFk) != null}
              <!-- No row to render (the subject is the reader), so the region carries the place
                   instead. Through `regionCrumb`, which is silent for a single-region member:
                   there is nothing to disambiguate for them. -->
              <p class="text-surface-500 px-1 text-[11px] font-semibold">
                {regionCrumb(global.userRegions, notification.regionFk)}
              </p>
            {/if}
          </article>
        {/each}
      {/snippet}

      {#snippet empty()}
        <div class="space-y-1 py-10 text-center">
          <p class="text-surface-950-50 font-semibold">{m.notifications_empty()}</p>
          <p class="text-surface-600-400 text-sm">{m.notifications_emptyBody()}</p>
        </div>
      {/snippet}
    </QueryState>
  </div>
</main>
