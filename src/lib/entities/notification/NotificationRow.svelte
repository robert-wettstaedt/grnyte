<!--
  One inbox row: who acted, what they did, when, and the thing it was about underneath.

  A component rather than markup inside the page, because most of its states cannot be produced
  with real data: a membership change needs real fan-out, and the tombstone is unreachable
  entirely, since `notifications.file_fk` cascades on delete. Stories are the only way to see them.
-->
<script lang="ts">
  import { resolve } from '$app/paths'
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import HydratedRow from '$lib/components/EntityRow/HydratedRow.svelte'
  import MediaTile from '$lib/components/Media/MediaTile.svelte'
  import type { CardRow } from '$lib/entities/event/cardView'
  import type { EventEntityRef } from '$lib/entities/event/entity'
  import { regionCrumb } from '$lib/entities/region/mapper'
  import { resolveMessage } from '$lib/i18n/message'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { getLocale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { now } from '$lib/state/now.svelte'
  import { notificationView } from './caption'
  import type { NotificationListItem } from './dto'

  interface Props {
    notification: NotificationListItem
    /** Whether the row was unread when the reader arrived, which is NOT `readAt`: opening the
     *  inbox stamps the lot, so the page latches this and hands it down. */
    unread: boolean
  }

  const { notification, unread }: Props = $props()

  const global = getGlobalState()

  const view = $derived(notificationView(notification))
  const crumb = $derived(regionCrumb(global.userRegions, notification.regionFk))

  // The file the row is about, hung off the parent entity by `toEventEntity`. Absent once the
  // video is deleted, which falls back to the avatar and a tombstone row.
  const media = $derived(notification.sourceType === 'video_ready' ? notification.entity?.files?.[0] : undefined)

  /**
   * Where this row happened, when it happened under a card.
   *
   * The event's own page, with the comment it was written about as the anchor: a reply, a comment
   * and a mention inside one all point at a line in a conversation, and that page renders the
   * thread in flow so there is something for `?comment=` to scroll to. A row about a description
   * mention or a role change names no event and stays plain text.
   */
  const href = $derived.by(() => {
    // The parent's page with the viewer open, not `/f/<id>`: that page is a share surface with no
    // nav, so a reader who arrives from the inbox has no way back into the app. A route page reads
    // `?media` for its own files and its ascents'; a block or area has no viewer and just opens.
    if (notification.sourceType === 'video_ready') {
      const parent = notification.entity?.href
      return parent == null || notification.object == null ? undefined : `${parent}?media=${notification.object.id}`
    }

    return notification.eventFk == null
      ? undefined
      : `${resolve('/(app)/events/[id]', { id: String(notification.eventFk) })}${
          notification.reactionFk == null ? '' : `?comment=${notification.reactionFk}`
        }`
  })

  const rowFor = (ref: EventEntityRef): CardRow => ({
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
</script>

<article
  class={[
    'space-y-2 rounded-2xl border p-3',
    unread ? 'border-primary-500/40 bg-primary-500/5' : 'border-surface-200-800 bg-surface-100-900',
  ]}
>
  <!-- The feed's header, in the same order and the same sizes: who, what, when. Every
       sentence here starts with the actor, so the face that goes with the name belongs
       on the row as much as it does on a card. -->
  <!-- The sentence is the link, not the whole card: the entity row underneath is
       already a link of its own, and an anchor cannot contain another. Tapping what a
       row SAYS opens where it happened; tapping the thing it names opens that thing. -->
  <svelte:element this={href == null ? 'header' : 'a'} {href} class="flex items-center gap-2.5">
    <!-- The video itself, where every other row shows who acted. `video_ready` is
         self-addressed, so that avatar is the reader's own face and identifies nothing;
         with two clips on one route the frame is the only thing that tells them apart.
         A minimum width keeps a portrait clip from rendering as a sliver. -->
    {#if media != null}
      <MediaTile class="h-[34px] min-w-[34px]" compact file={media} />
    {:else}
      <Avatar name={notification.actorName} size={34} solid loading={notification.actorName.length === 0} />
    {/if}

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
  </svelte:element>

  {#if view.ref != null}
    <HydratedRow row={rowFor(view.ref)} />
  {/if}
</article>
