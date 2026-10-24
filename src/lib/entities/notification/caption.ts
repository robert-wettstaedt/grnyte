import type { EventEntityRef } from '$lib/entities/event/entity'
import type { RemovableKind, RemovedItem } from '$lib/entities/moderation/dto'
import { roleLabelFor } from '$lib/entities/rolePermission/mapper'
import type { MessageKey, MessageOptions } from '$lib/i18n/message'
import type { NotificationListItem, NotificationSourceType } from './dto'
import { sourceTraits } from './sourceType'

/**
 * What one inbox row says, decided before any markup touches it.
 *
 * A message key and its params, never resolved copy, the same contract the feed's cards use: a
 * test can then assert that a deleted ascent picks `notifications_ascentDeleted` without
 * asserting on the English or German sentence that key happens to hold this week.
 */
export interface NotificationView {
  key: MessageKey
  params: { actor: string; count?: number; name?: string; region?: string; role?: string }
  /**
   * What the row renders underneath the caption, for the shared hydration to resolve.
   *
   * Absent whenever the row would only repeat its own sentence: the inbox's `row: false` types
   * (see `sourceType.ts`):
   * - a role change stores the member it is about, which is the recipient, so the row would be
   *   their own name linking to their own profile;
   * - an accepted invitation stores the person who accepted, who is the actor the caption already
   *   names and the avatar already shows;
   * - a deleted ascent can only hydrate into a tombstone, and "your ascent" is the one thing the
   *   caption has already said.
   *
   * The region carries the place in each, and `regionFk` already holds it.
   */
  ref: EventEntityRef | undefined
}

/** One key per source type. Exhaustive by construction: a value added to the DB enum (and
 *  regenerated into the Zero schema) breaks this record at compile time. */
const KEYS: Record<NotificationSourceType, MessageKey> = {
  ascent_deleted: 'notifications_ascentDeleted',
  ascent_edited: 'notifications_ascentEdited',
  comment: 'notifications_comment',
  comment_reaction: 'notifications_commentReaction',
  comment_reply: 'notifications_commentReply',
  content_removed: 'notifications_contentRemoved',
  content_restored: 'notifications_contentRestored',
  invitation_received: 'notifications_invitationReceived',
  invite_accepted: 'notifications_inviteAccepted',
  membership_removed: 'notifications_membershipRemoved',
  mention: 'notifications_mention',
  reaction: 'notifications_reaction',
  role_changed: 'notifications_roleChanged',
  video_ready: 'notifications_videoReady',
}

/**
 * Only what the sentence reads, so the push cron can hand over a database row without inventing
 * the fields the inbox needs and it does not (an id, a clock, a read stamp).
 */
export type NotificationSubject = Pick<NotificationListItem, 'actorName' | 'metadata' | 'object' | 'sourceType'> & {
  /** What the row is about, named. Only the push cron joins it: the inbox draws the entity row
   *  instead, and a sentence repeating the name beside that row says it twice. */
  objectName?: string
  /** The region's name, for the two sentences that say it. The cron joins it; the inbox never
   *  needs it, so it stays optional rather than becoming a field every caller has to fetch. */
  regionName?: string
}

export function notificationView(notification: NotificationSubject, options?: MessageOptions): NotificationView {
  // Through `roleLabelFor` rather than `roleLabel`, because this value came out of storage: the
  // plain label answers "Admin" for anything it does not recognise, so a retired role would read
  // as a promotion. An unresolvable one falls back to the generic sentence, which is still true.
  //
  // `options` carries the recipient's locale for the push cron: this label is resolved HERE, so
  // the caller's own `resolveMessage(..., { locale })` around the sentence cannot reach inside it.
  const role = notification.sourceType === 'role_changed' ? roleLabelFor(notification.metadata, options) : undefined

  // The inbox draws the entity row, so its sentence never needs the name; a push has no row and
  // says it in the title. Only the cron passes `objectName`, so only the push picks the key.
  const named = notification.sourceType === 'video_ready' && (notification.objectName ?? '').length > 0

  const items = REMOVAL.has(notification.sourceType) ? removedItems(notification.metadata) : []

  return {
    key: named
      ? 'notifications_videoReadyNamed'
      : REMOVAL.has(notification.sourceType)
        ? removalKey(notification.sourceType, items)
        : role == null && notification.sourceType === 'role_changed'
          ? 'notifications_roleChangedPlain'
          : KEYS[notification.sourceType],
    params: {
      actor: notification.actorName,
      count: items.length,
      name: items.length === 1 ? items[0].name : notification.objectName,
      region: notification.regionName,
      role,
    },
    // A row whose object is gone has none to point at, which reads the same way as the
    // sentence-only types: the sentence stands on its own and nothing is drawn under
    // it. The sentence itself never asked what type the object was.
    ref:
      !sourceTraits(notification.sourceType).row || notification.object == null
        ? undefined
        : { id: String(notification.object.id), type: notification.object.type },
  }
}

const REMOVAL = new Set<NotificationSourceType>(['content_removed', 'content_restored'])

// A leaf goes by what holds it, so its sentence names the kind; a reversed photo was not restored.
const REMOVED_ONE: Partial<Record<RemovableKind, MessageKey>> = {
  ascent: 'notifications_contentRemovedAscent',
  file: 'notifications_contentRemovedFile',
  topo: 'notifications_contentRemovedTopo',
}
const RESTORED_ONE: Partial<Record<RemovableKind, MessageKey>> = {
  ascent: 'notifications_contentRestoredAscent',
  file: 'notifications_contentReversedFile',
  topo: 'notifications_contentReversedTopo',
}

function removalKey(sourceType: NotificationSourceType, items: RemovedItem[]): MessageKey {
  const removed = sourceType === 'content_removed'
  if (items.length > 1) return removed ? 'notifications_contentRemovedMany' : 'notifications_contentRestoredMany'
  const kind = items[0]?.kind
  return (kind && (removed ? REMOVED_ONE : RESTORED_ONE)[kind]) || KEYS[sourceType]
}

function removedItems(metadata: null | string | undefined): RemovedItem[] {
  try {
    const parsed: unknown = JSON.parse(metadata ?? '[]')
    return Array.isArray(parsed) ? (parsed as RemovedItem[]) : []
  } catch {
    return []
  }
}
