<script module lang="ts">
  import { areaEntity, fileEntity, PEOPLE, photo, routeEntity } from '$lib/entities/event/cases/world'
  import type { EventEntity } from '$lib/entities/event/entity'
  import type { MediaFile } from '$lib/entities/file/dto'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import { MEMBER, USER } from '../../../../.storybook/regions'
  import type { NotificationListItem, NotificationSourceType } from './dto'
  import NotificationRow from './NotificationRow.svelte'

  // Most of these states are hard or impossible to reach with real data: a role change needs an
  // admin to act, and the tombstone cannot be produced AT ALL, because `notifications.file_fk`
  // cascades on delete, so a row never outlives the file it names. Stories are the only way to see
  // them, which is why this file exists.
  //
  // Deliberately absent: `invitation_received` and `membership_removed`. `QUEUE_ONLY` in
  // `queries.ts` excludes them from the inbox query, so they never render here, and a story of one
  // would describe a screen nobody can open.
  const { Story } = defineMeta({
    component: NotificationRow,
    parameters: {
      globalState: { user: USER, userRegions: MEMBER },
      layout: 'padded',
      width: 560,
    },
    tags: ['autodocs'],
    title: 'Notifications/NotificationRow',
  })

  const MINUTE = 60_000
  const HOUR = 60 * MINUTE

  const notification = (
    sourceType: NotificationSourceType,
    over: Partial<NotificationListItem> = {},
  ): NotificationListItem => ({
    actorFk: 2,
    actorName: PEOPLE[2],
    createdAt: Date.now() - 2 * HOUR,
    entity: routeEntity('Rampe', 12),
    eventFk: 900,
    id: 1,
    metadata: undefined,
    object: { id: 502, type: 'route' },
    reactionFk: undefined,
    readAt: Date.now(),
    regionFk: 1,
    sourceType,
    ...over,
  })

  /** A video, which `photo` cannot express: the tile branches on `bunnyStreamFk`. The GUID is not
   *  a real one, so the tile falls through its ladder to the play placeholder rather than fetching. */
  const clip = (): MediaFile => ({
    ...photo('clip-1'),
    bunnyStreamFk: '00000000-0000-4000-8000-00000000c11p',
    height: undefined,
    path: '',
    readiness: 'ready',
    width: undefined,
  })

  const withVideo = (entity: EventEntity) => fileEntity(entity, [clip()])
</script>

<!-- ─────────────────────────────────────────────────────────────────────────────────────────────
     THE EVERYDAY ROWS. Each one is a sentence plus the thing it happened to.
     ───────────────────────────────────────────────────────────────────────────────────────── -->

<Story name="Mention" args={{ notification: notification('mention'), unread: false }} />

<!-- Carries `reactionFk`, so the link anchors to the line in the thread rather than to the card. -->
<Story
  name="Comment reply"
  args={{ notification: notification('comment_reply', { reactionFk: 4265 }), unread: false }}
/>

<Story name="Reaction" args={{ notification: notification('reaction', { reactionFk: 4266 }), unread: false }} />

<Story name="Ascent edited" args={{ notification: notification('ascent_edited'), unread: false }} />

<!-- Unread is latched on arrival, not read off `readAt`: opening the inbox stamps every row, so
     without the latch the highlight would vanish before anyone saw it. -->
<Story name="Unread" args={{ notification: notification('mention'), unread: true }} />

<!-- ─────────────────────────────────────────────────────────────────────────────────────────────
     SENTENCE-ONLY ROWS. `NO_ROW` in caption.ts: the sentence already names the subject, so a row
     underneath would only repeat it. These show the region crumb instead, which the entity row
     would otherwise carry in its own crumbs.
     ───────────────────────────────────────────────────────────────────────────────────────── -->

<Story
  name="Ascent deleted"
  args={{ notification: notification('ascent_deleted', { entity: undefined, object: undefined }), unread: false }}
/>

<Story
  name="Role changed"
  args={{
    notification: notification('role_changed', {
      entity: undefined,
      eventFk: undefined,
      metadata: 'region_maintainer',
      object: undefined,
    }),
    unread: false,
  }}
/>

<!-- No event and no object at all, so the row is a `<header>` rather than an anchor: nothing to
     open. Worth seeing, because it is the one row a reader can tap without anything happening. -->
<Story
  name="Nothing to open"
  args={{
    notification: notification('role_changed', { entity: undefined, eventFk: undefined, object: undefined }),
    unread: false,
  }}
/>

<!-- ─────────────────────────────────────────────────────────────────────────────────────────────
     VIDEO ROWS. Self-addressed, so the avatar would be the reader's own face and identifies
     nothing; the clip's own frame takes that slot instead.
     ───────────────────────────────────────────────────────────────────────────────────────── -->

<Story
  name="Video ready"
  args={{
    notification: notification('video_ready', {
      entity: withVideo(routeEntity('Rampe', 12)),
      eventFk: undefined,
      object: { id: 'file-1', type: 'file' },
    }),
    unread: true,
  }}
/>

<!-- On an area rather than a route, so the borrowed entity row is visibly the parent's and not the
     file's: a file has no page and no name of its own. -->
<Story
  name="Video ready on an area"
  args={{
    notification: notification('video_ready', {
      entity: withVideo(areaEntity('Westwand', 'Steinbruch')),
      eventFk: undefined,
      object: { id: 'file-2', type: 'file' },
    }),
    unread: false,
  }}
/>

<!-- UNREACHABLE WITH REAL DATA. `notifications.file_fk` is ON DELETE CASCADE, so deleting a video
     deletes this row with it and the foreign key refuses to let one be fabricated. The branch still
     exists in HydratedRow, and this is the only place it can be looked at. -->
<Story
  name="Video deleted (tombstone)"
  args={{
    notification: notification('video_ready', {
      entity: undefined,
      eventFk: undefined,
      object: { id: 'file-3', type: 'file' },
    }),
    unread: false,
  }}
/>

<!-- ─────────────────────────────────────────────────────────────────────────────────────────────
     EDGES.
     ───────────────────────────────────────────────────────────────────────────────────────── -->

<!-- The actor's row has not synced yet, so the avatar shows its loading state rather than an
     initial, and the sentence is missing its name. Transient, and it is what a cold open looks
     like on a slow connection. -->
<Story name="Actor not synced" args={{ notification: notification('mention', { actorName: '' }), unread: false }} />

<!-- Minutes old rather than hours, because the timestamp switches to a relative phrase and then
     back to a date: the three stories above all sit in the same band. -->
<Story
  name="Just now"
  args={{ notification: notification('comment', { createdAt: Date.now() - 2 * MINUTE }), unread: true }}
/>
