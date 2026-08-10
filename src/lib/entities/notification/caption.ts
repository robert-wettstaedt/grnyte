import type { ActivityEntityRef } from '$lib/entities/activity/entity'
import { roleLabelFor } from '$lib/entities/rolePermission/mapper'
import type { MessageKey } from '$lib/i18n/message'
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
   * Absent when the subject is the reader: a role change stores the member it is about, which is
   * the recipient, so a row would be their own name linking to their own profile. The region the
   * role changed in is what the reader actually wants, and `regionFk` already carries it.
   */
  ref: ActivityEntityRef | undefined
}

/** One key per source type. Exhaustive by construction: a value added to the DB enum (and
 *  regenerated into the Zero schema) breaks this record at compile time. */
const KEYS: Record<NotificationSourceType, MessageKey> = {
  ascent_deleted: 'notifications_ascentDeleted',
  ascent_edited: 'notifications_ascentEdited',
  invite_accepted: 'notifications_inviteAccepted',
  mention: 'notifications_mention',
  role_changed: 'notifications_roleChanged',
}

export function notificationView(notification: NotificationListItem): NotificationView {
  // Through `roleLabelFor` rather than `roleLabel`, because this value came out of storage: the
  // plain label answers "Admin" for anything it does not recognise, so a retired role would read
  // as a promotion. An unresolvable one falls back to the generic sentence, which is still true.
  const role = notification.sourceType === 'role_changed' ? roleLabelFor(notification.metadata) : undefined

  return {
    key:
      role == null && notification.sourceType === 'role_changed'
        ? 'notifications_roleChangedPlain'
        : KEYS[notification.sourceType],
    params: { actor: notification.actorName, role },
    ref:
      notification.sourceType === 'role_changed'
        ? undefined
        : { id: notification.entityId, type: notification.entityType },
  }
}
