import { m } from '$lib/paraglide/messages'
import { describe, expect, it } from 'vitest'
import { resolveStatus } from './statusBar'

describe('resolveStatus', () => {
  it('shows nothing when online and connected', () => {
    expect(resolveStatus(true, 'connected', false)).toBeNull()
  })

  it('offline wins over a sync that is merely retrying', () => {
    for (const connection of ['connected', 'connecting'] as const) {
      const status = resolveStatus(false, connection, false)
      expect(status).toMatchObject({ icon: 'no-signal', tone: 'preset-tonal-warning' })
      expect(status?.action).toBeUndefined()
    }
  })

  it('but not over a sync that has stopped, because only that branch offers a way out', () => {
    // A terminal state needs a reload, and the offline bar has no action on it. Suppressing the
    // reload button behind a reachability flag that had gone stale left a reader with a dead sync
    // looking at "you're offline" and nothing to press. Being told the wrong cause is survivable;
    // being shown no way out is not.
    for (const connection of ['needs-auth', 'error', 'closed'] as const) {
      expect(resolveStatus(false, connection, false)).toMatchObject({ action: 'reload', role: 'alert' })
    }
  })

  it('offers a reload on the terminal states only', () => {
    for (const connection of ['needs-auth', 'error', 'closed'] as const) {
      expect(resolveStatus(true, connection, false)).toMatchObject({ action: 'reload', role: 'alert' })
    }

    const transient = resolveStatus(true, 'connecting', false)
    expect(transient).toMatchObject({ role: 'status' })
    expect(transient?.action).toBeUndefined()
  })

  it('offers a reload when this document is running an older build', () => {
    expect(resolveStatus(true, 'connected', true)).toMatchObject({
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
    for (const connection of ['needs-auth', 'error', 'closed'] as const) {
      expect(resolveStatus(true, connection, true)).toMatchObject({ message: m.status_notSyncing })
    }

    expect(resolveStatus(false, 'connected', true)).toMatchObject({ message: m.status_offline })
    expect(resolveStatus(true, 'connecting', true)).toMatchObject({ message: m.status_reconnecting })
  })
})
