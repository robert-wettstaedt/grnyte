import { m } from '$lib/paraglide/messages'
import { describe, expect, it } from 'vitest'
import { isAnnouncementActive, resolveStatus } from './StatusBar.svelte'

const announcement = () => 'Hello'

describe('resolveStatus', () => {
  it('shows nothing when online, connected and without an announcement', () => {
    expect(resolveStatus(true, 'connected', null)).toBeNull()
  })

  it('offline wins over every sync state', () => {
    for (const connection of ['connected', 'connecting', 'needs-auth', 'closed', 'error']) {
      const status = resolveStatus(false, connection, announcement)
      expect(status).toMatchObject({ icon: 'no-signal', tone: 'preset-tonal-warning' })
      expect(status?.action).toBeUndefined()
    }
  })

  it('offers a reload on the terminal states only', () => {
    for (const connection of ['needs-auth', 'error', 'closed']) {
      expect(resolveStatus(true, connection, null)).toMatchObject({ action: 'reload', role: 'alert' })
    }

    const transient = resolveStatus(true, 'connecting', null)
    expect(transient).toMatchObject({ role: 'status' })
    expect(transient?.action).toBeUndefined()
  })

  it('shows the announcement only while connected', () => {
    expect(resolveStatus(true, 'connected', announcement)?.message()).toBe('Hello')
    expect(resolveStatus(true, 'connecting', announcement)).toMatchObject({
      message: m.status_reconnecting,
      role: 'status',
    })
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

  it('stays closed once its own id is dismissed', () => {
    expect(isAnnouncementActive(notice, new Set(['v2']), during)).toBe(false)
  })

  it('is unaffected by a dismissal of some other announcement', () => {
    expect(isAnnouncementActive(notice, new Set(['v1']), during)).toBe(true)
  })
})
