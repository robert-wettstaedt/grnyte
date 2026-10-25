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
  decisionFk: undefined,
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

  it('names a handover as becoming the owner', () => {
    const view = notificationView(
      notification({ metadata: 'owner', object: { id: 5, type: 'user' }, sourceType: 'role_changed' }),
    )

    expect(view.key).toBe('notifications_roleChanged')
    expect(view.params.role).toBe('Owner')
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
  // the caption has already called "your ascent".
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

  const video = (over: Partial<Subject> = {}) =>
    notification({ object: { id: 'fil3', type: 'file' }, sourceType: 'video_ready', ...over })

  // The inbox draws the file's parent under the sentence, so the row has to point at something.
  it('points a ready video at its file, so the inbox has a row to draw', () => {
    expect(notificationView(video()).ref).toEqual({ id: 'fil3', type: 'file' })
  })

  // Only the cron supplies a name, and only the push needs one: the inbox says it in the row.
  it('names the place in the sentence when the cron supplied one', () => {
    const view = notificationView(video({ objectName: 'Karma' }))
    expect(resolveMessage(view.key, view.params)).toContain('Karma')
  })

  it('keeps the plain sentence for the inbox, which passes no name', () => {
    const view = notificationView(video())
    expect(view.key).toBe('notifications_videoReady')
    expect(resolveMessage(view.key, view.params)).not.toContain('undefined')
  })

  // A file whose parent was gone at fan-out resolves to no name, which must read as the plain
  // sentence rather than as "ready: " with nothing after the colon.
  it('falls back to the plain sentence when the name resolves empty', () => {
    expect(notificationView(video({ objectName: '' })).key).toBe('notifications_videoReady')
  })

  const removal = (sourceType: NotificationSourceType, names: string[]) =>
    notificationView(
      notification({
        metadata: JSON.stringify(names.map((name) => ({ kind: 'route', name }))),
        object: undefined,
        sourceType,
      }),
    )

  it('names the one item removed, and says a region admin did it', () => {
    const view = removal('content_removed', ['Odin'])
    const sentence = resolveMessage(view.key, view.params)

    expect(sentence).toContain('Odin')
    expect(sentence).toContain('region admin')
    expect(sentence).not.toContain('Anna')
    expect(view.ref).toBeUndefined()
  })

  // Passive: an app admin may have reversed it, so naming a region admin would be false.
  it('names the one item restored, without saying who restored it', () => {
    const view = removal('content_restored', ['Odin'])
    const sentence = resolveMessage(view.key, view.params)

    expect(sentence).toContain('Odin')
    expect(sentence).toContain('restored')
    expect(sentence).not.toContain('admin')
  })

  // A photo goes by the route it hangs on, so the sentence must not read as the route removed.
  it('says a removed photo was a photo, and a reversed one was not restored', () => {
    const photo = (sourceType: NotificationSourceType) => {
      const view = notificationView(
        notification({ metadata: JSON.stringify([{ kind: 'file', name: 'Odin' }]), object: undefined, sourceType }),
      )
      return resolveMessage(view.key, view.params)
    }

    expect(photo('content_removed')).toBe('A region admin removed your photo or video on “Odin”')
    expect(photo('content_restored')).toBe('The removal of your photo or video on “Odin” was reversed')
  })

  const report = (sourceType: NotificationSourceType, notice: object) =>
    notificationView(notification({ metadata: JSON.stringify(notice), object: undefined, sourceType }))

  it.each([
    ['content_reported', { kind: 'route', name: 'Odin' }, 'notifications_contentReported'],
    ['content_reported', { kind: 'comment' }, 'notifications_contentReportedComment'],
    ['report_closed', { kind: 'route', name: 'Odin', outcome: 'acted_on' }, 'notifications_reportActedOn'],
    ['report_closed', { kind: 'comment', outcome: 'acted_on' }, 'notifications_reportActedOnComment'],
    ['report_closed', { kind: 'route', name: 'Odin', outcome: 'stays' }, 'notifications_reportStays'],
    ['report_closed', { kind: 'comment', outcome: 'stays' }, 'notifications_reportStaysComment'],
    // A leaf goes by what holds it, so the sentence names its kind, as a removal notice does.
    ['content_reported', { kind: 'file', name: 'Odin' }, 'notifications_contentReportedFile'],
    ['report_closed', { kind: 'ascent', name: 'Odin', outcome: 'acted_on' }, 'notifications_reportActedOnAscent'],
    ['report_closed', { kind: 'topo', name: 'Block 3', outcome: 'stays' }, 'notifications_reportStaysTopo'],
  ] as [NotificationSourceType, object, string][])('words a %s notice on %o as %s', (sourceType, notice, key) => {
    expect(report(sourceType, notice).key).toBe(key)
  })

  it('names what was reported, and nobody involved', () => {
    const view = report('report_closed', { kind: 'route', name: 'Odin', outcome: 'stays' })
    const sentence = resolveMessage(view.key, view.params)

    expect(sentence).toContain('Odin')
    expect(sentence).not.toContain('Anna')
    expect(view.ref).toBeUndefined()
  })
})
