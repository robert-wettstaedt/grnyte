import type { EventEntityRef } from '$lib/entities/event/entity'
import { roleLabelFor } from '$lib/entities/rolePermission/mapper'
import type { MessageKey, MessageOptions } from '$lib/i18n/message'
import type { NotificationListItem, NotificationSourceType } from './dto'

/**
 * What one inbox row says, decided before any markup touches it.
 *
 * A message key and its params, never resolved copy, the same contract the feed's cards use: a
 * test can then assert that a deleted ascent picks `notifications_ascentDeleted` without
 * asserting on the English or German sentence that key happens to hold this week.
 */
export interface NotificationView {
  key: MessageKey
  params: { actor: string; role?: string }
  /**
   * What the row renders underneath the caption, for the shared hydration to resolve.
   *
   * Absent whenever the row would only repeat its own sentence, which is the case for three of
   * the five source types:
   * - a role change stores the member it is about, which is the recipient, so the row would be
   *   their own name linking to their own profile;
   * - an accepted invitation stores the person who accepted, who is the actor the caption already
   *   names and the avatar already shows;
   * - a deleted ascent can only hydrate into a tombstone, and "your ascent" is the one thing the
   *   caption has already said.
   *
   * The region carries the place in all three, and `regionFk` already holds it.
   */
  ref: EventEntityRef | undefined
}

/** The source types whose subject the caption (and the actor's avatar) has already said. */
const NO_ROW = new Set<NotificationSourceType>(['ascent_deleted', 'invite_accepted', 'role_changed'])

/** One key per source type. Exhaustive by construction: a value added to the DB enum (and
 *  regenerated into the Zero schema) breaks this record at compile time. */
const KEYS: Record<NotificationSourceType, MessageKey> = {
  ascent_deleted: 'notifications_ascentDeleted',
  ascent_edited: 'notifications_ascentEdited',
  comment: 'notifications_comment',
  comment_reaction: 'notifications_commentReaction',
  comment_reply: 'notifications_commentReply',
  invite_accepted: 'notifications_inviteAccepted',
  mention: 'notifications_mention',
  reaction: 'notifications_reaction',
  role_changed: 'notifications_roleChanged',
}

/**
 * Only what the sentence reads, so the push cron can hand over a database row without inventing
 * the fields the inbox needs and it does not (an id, a clock, a read stamp).
 */
export type NotificationSubject = Pick<NotificationListItem, 'actorName' | 'metadata' | 'object' | 'sourceType'>

export function notificationView(notification: NotificationSubject, options?: MessageOptions): NotificationView {
  // Through `roleLabelFor` rather than `roleLabel`, because this value came out of storage: the
  // plain label answers "Admin" for anything it does not recognise, so a retired role would read
  // as a promotion. An unresolvable one falls back to the generic sentence, which is still true.
  //
  // `options` carries the recipient's locale for the push cron: this label is resolved HERE, so
  // the caller's own `resolveMessage(..., { locale })` around the sentence cannot reach inside it.
  const role = notification.sourceType === 'role_changed' ? roleLabelFor(notification.metadata, options) : undefined

  return {
    key:
      role == null && notification.sourceType === 'role_changed'
        ? 'notifications_roleChangedPlain'
        : KEYS[notification.sourceType],
    params: { actor: notification.actorName, role },
    // A row whose object is gone has none to point at, which reads the same way as the three
    // source types that never had one: the sentence stands on its own and nothing is drawn under
    // it. The sentence itself never asked what type the object was.
    ref:
      NO_ROW.has(notification.sourceType) || notification.object == null
        ? undefined
        : { id: String(notification.object.id), type: notification.object.type },
  }
}
