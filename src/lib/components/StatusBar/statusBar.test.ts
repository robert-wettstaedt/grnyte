import { m } from '$lib/paraglide/messages'
import { describe, expect, it } from 'vitest'
import { isAnnouncementActive, resolveStatus } from './statusBar'

const announcement = () => 'Hello'

describe('resolveStatus', () => {
  it('shows nothing when online, connected and without an announcement', () => {
    expect(resolveStatus(true, 'connected', null, false)).toBeNull()
  })

  it('offline wins over a sync that is merely retrying', () => {
    for (const connection of ['connected', 'connecting']) {
      const status = resolveStatus(false, connection, announcement, false)
      expect(status).toMatchObject({ icon: 'no-signal', tone: 'preset-tonal-warning' })
      expect(status?.action).toBeUndefined()
    }
  })

  it('but not over a sync that has stopped, because only that branch offers a way out', () => {
    // A terminal state needs a reload, and the offline bar has no action on it. Suppressing the
    // reload button behind a reachability flag that had gone stale left a reader with a dead sync
    // looking at "you're offline" and nothing to press. Being told the wrong cause is survivable;
    // being shown no way out is not.
    for (const connection of ['needs-auth', 'error', 'closed']) {
      expect(resolveStatus(false, connection, announcement, false)).toMatchObject({ action: 'reload', role: 'alert' })
    }
  })

  it('offers a reload on the terminal states only', () => {
    for (const connection of ['needs-auth', 'error', 'closed']) {
      expect(resolveStatus(true, connection, null, false)).toMatchObject({ action: 'reload', role: 'alert' })
    }

    const transient = resolveStatus(true, 'connecting', null, false)
    expect(transient).toMatchObject({ role: 'status' })
    expect(transient?.action).toBeUndefined()
  })

  it('shows the announcement only while connected', () => {
    expect(resolveStatus(true, 'connected', announcement, false)?.message()).toBe('Hello')
    expect(resolveStatus(true, 'connecting', announcement, false)).toMatchObject({
      message: m.status_reconnecting,
      role: 'status',
    })
  })

  it('offers a reload when this document is running an older build', () => {
    expect(resolveStatus(true, 'connected', null, true)).toMatchObject({
      action: 'reload',
      message: m.status_updateReady,
      // `status`, not `alert`: nothing is broken, and the swap happens by itself at the next
      // screen change. An alert would interrupt a screen reader over a routine deploy.
      role: 'status',
    })
  })

  it('ranks an update below everything that says something is wrong', () => {
    // The update branch is last on purpose, so this is the whole of that ordering. A deploy lands
    // while a reader is offline or mid-reconnect just as often as it lands on a healthy client,
    // and "a new version is ready" over the top of "you're offline" is a contradiction.
    for (const connection of ['needs-auth', 'error', 'closed']) {
      expect(resolveStatus(true, connection, null, true)).toMatchObject({ message: m.status_notSyncing })
    }

    expect(resolveStatus(false, 'connected', null, true)).toMatchObject({ message: m.status_offline })
    expect(resolveStatus(true, 'connecting', null, true)).toMatchObject({ message: m.status_reconnecting })
    // An announcement is admin-authored and time-boxed; an update notice recurs every deploy.
    expect(resolveStatus(true, 'connected', announcement, true)?.message()).toBe('Hello')
  })
})

describe('isAnnouncementActive', () => {
  const notice = { endsAt: '2026-08-01T00:00:00Z', id: 'v2', message: announcement }
  const during = Date.parse('2026-07-29T00:00:00Z')
  const after = Date.parse('2026-08-02T00:00:00Z')

  it('is active inside its window while undismissed', () => {
    expect(isAnnouncementActive(notice, new Set(), during)).toBe(true)
  })

  it('expires at endsAt even if nobody ever dismissed it', () => {
    expect(isAnnouncementActive(notice, new Set(['other']), after)).toBe(false)
  })

  it('is over at the instant of endsAt, not a moment after', () => {
    // The test above lands a day late, so it never says which side of `endsAt` the boundary is on.
    expect(isAnnouncementActive(notice, new Set(), Date.parse(notice.endsAt))).toBe(false)
  })

  it('stays closed once its own id is dismissed', () => {
    expect(isAnnouncementActive(notice, new Set(['v2']), during)).toBe(false)
  })

  it('is unaffected by a dismissal of some other announcement', () => {
    expect(isAnnouncementActive(notice, new Set(['v1']), during)).toBe(true)
  })
})
