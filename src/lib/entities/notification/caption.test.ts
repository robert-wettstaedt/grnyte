import { resolveMessage } from '$lib/i18n/message'
import { describe, expect, it } from 'vitest'
import { notificationView, type NotificationSubject } from './caption'
import type { NotificationListItem, NotificationSourceType } from './dto'

/** A full inbox row plus the one field only the cron supplies, so a test can hand over either. */
type Subject = NotificationListItem & NotificationSubject

const notification = (over: Partial<Subject> = {}): Subject => ({
  actorFk: 2,
  actorName: 'Anna',
  createdAt: 0,
  entity: undefined,
  eventFk: undefined,
  id: 1,
  metadata: undefined,
  object: { id: 42, type: 'route' },
  reactionFk: undefined,
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
    ['comment', 'notifications_comment'],
    // Its own sentence rather than the thread's: being answered is what the reader wants to know,
    // and `notifyComment` writes exactly one of the two for any one person.
    ['comment_reply', 'notifications_commentReply'],
    ['membership_removed', 'notifications_membershipRemoved'],
    ['invitation_received', 'notifications_invitationReceived'],
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
  it.each([
    'ascent_deleted',
    'invitation_received',
    'invite_accepted',
    'membership_removed',
    'role_changed',
  ] as NotificationSourceType[])('renders no row for %s', (sourceType) => {
    expect(notificationView(notification({ object: { id: 5, type: 'user' }, sourceType })).ref).toBeUndefined()
  })

  // The two sentences that name a place. Everything else leaves the region to the crumb the inbox
  // draws from `region_fk`; these two go out as a push or an email, where there is no crumb.
  it.each(['membership_removed', 'invitation_received'] as NotificationSourceType[])(
    'carries the region into %s',
    (sourceType) => {
      const view = notificationView(notification({ regionName: 'Harz', sourceType }))
      expect(view.params.region).toBe('Harz')
    },
  )

  // Asserted on the resolved sentence rather than on the param, because the param is passed
  // through for every source type: what makes the two membership ones different is that they are
  // the only sentences that READ it. A key that stopped naming the region would leave the caption
  // saying nothing about where, and the param assertion alone would still pass.
  it.each(['membership_removed', 'invitation_received'] as NotificationSourceType[])(
    'resolves %s into a sentence that names the region',
    (sourceType) => {
      const view = notificationView(notification({ regionName: 'Harz', sourceType }))
      expect(resolveMessage(view.key, view.params)).toContain('Harz')
    },
  )

  it('leaves the region out of a sentence that does not say it', () => {
    const view = notificationView(notification({ regionName: 'Harz', sourceType: 'mention' }))
    expect(resolveMessage(view.key, view.params)).not.toContain('Harz')
  })
})
