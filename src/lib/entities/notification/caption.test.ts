import { describe, expect, it } from 'vitest'
import { notificationView } from './caption'
import type { NotificationListItem, NotificationSourceType } from './dto'

const notification = (over: Partial<NotificationListItem> = {}): NotificationListItem => ({
  actorFk: 2,
  actorName: 'Anna',
  createdAt: 0,
  entity: undefined,
  id: 1,
  metadata: undefined,
  object: { id: 42, type: 'route' },
  readAt: undefined,
  regionFk: 1,
  sourceType: 'mention',
  ...over,
})

describe('notificationView', () => {
  // Keys, not copy: a test that asserted the sentence would have to be rewritten every time a
  // translator touched it, and would still not say which key the row picked.
  it.each([
    ['mention', 'notifications_mention'],
    ['ascent_edited', 'notifications_ascentEdited'],
    ['ascent_deleted', 'notifications_ascentDeleted'],
    ['invite_accepted', 'notifications_inviteAccepted'],
  ] as [NotificationSourceType, string][])('picks %s s own sentence', (sourceType, key) => {
    expect(notificationView(notification({ sourceType })).key).toBe(key)
  })

  it('names the granted role', () => {
    const view = notificationView(
      notification({ metadata: 'region_maintainer', object: { id: 5, type: 'user' }, sourceType: 'role_changed' }),
    )

    expect(view.key).toBe('notifications_roleChanged')
    expect(view.params.role).toBe('Maintainer')
  })

  /**
   * The reason this goes through `roleLabelFor`. The plain label answers "Admin" for anything it
   * does not recognise, so a role that was retired since the row was written would read as a
   * promotion. Falling back to the role-less sentence is still true.
   */
  it.each(['app_admin', 'region_overlord', undefined])('falls back to the plain sentence for %s', (metadata) => {
    const view = notificationView(
      notification({ metadata, object: { id: 5, type: 'user' }, sourceType: 'role_changed' }),
    )

    expect(view.key).toBe('notifications_roleChangedPlain')
    expect(view.params.role).toBeUndefined()
  })

  it('hands the row its subject to hydrate', () => {
    expect(notificationView(notification({ object: { id: 9, type: 'ascent' } })).ref).toEqual({
      id: '9',
      type: 'ascent',
    })
  })

  // The three sentences that already contain their own subject. A row underneath them could only
  // repeat the caption: their own name, the actor the avatar shows, or a tombstone for an ascent
  // the caption has just called "your ascent".
  it.each(['ascent_deleted', 'invite_accepted', 'role_changed'] as NotificationSourceType[])(
    'renders no row for %s',
    (sourceType) => {
      expect(notificationView(notification({ object: { id: 5, type: 'user' }, sourceType })).ref).toBeUndefined()
    },
  )
})
