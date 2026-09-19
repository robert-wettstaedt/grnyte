/**
 * The rotation path, which is invisible from both ends: a subscription bound to a retired VAPID key
 * still exists, still reads as healthy in the browser, and is rejected by the push service on every
 * send. Firefox answers 401, which `sendPush` does not treat as a dead subscription, so nothing
 * prunes the row either and that device is undeliverable until somebody toggles push by hand.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CURRENT_KEY = 'Y3VycmVudC12YXBpZC1rZXk'

const subscribeToPush = vi.fn()
const unsubscribeFromPush = vi.fn()
vi.mock('$lib/entities/notification/notifications.remote', () => ({ subscribeToPush, unsubscribeFromPush }))
vi.mock('$env/dynamic/public', () => ({ env: { PUBLIC_VAPID_KEY: CURRENT_KEY } }))
// The remembered-endpoint key is built from this, so the test owns it rather than guessing it.
vi.mock('$env/static/public', () => ({ PUBLIC_APPLICATION_NAME: 'grnyte' }))

/** The bytes a subscription carries, built from the key's own text rather than through the
 *  module's decoder, so the comparison is not checked against itself. */
const keyBytes = (text: string) => new TextEncoder().encode(text).buffer

const subscription = (endpoint: string, key: string) => ({
  endpoint,
  options: { applicationServerKey: keyBytes(key) },
  toJSON: () => ({ endpoint, expirationTime: null, keys: { auth: 'a', p256dh: 'p' } }),
  unsubscribe: vi.fn().mockResolvedValue(true),
})

let live: null | ReturnType<typeof subscription> = null
const subscribe = vi.fn()

vi.stubGlobal('Notification', { permission: 'granted' })
vi.stubGlobal('PushManager', class {})
Object.defineProperty(navigator, 'serviceWorker', {
  configurable: true,
  value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => live, subscribe } }) },
})

const { pushEndpoint, syncPushSubscription } = await import('./push.svelte')

const ENDPOINT_KEY = 'grnyte.pushEndpoint'

describe('syncPushSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset, not clear: a test that leaves an implementation behind decides the next one's outcome.
    subscribe.mockReset()
    localStorage.clear()
    live = null
  })

  it('re-subscribes a device whose subscription was made with a retired key', async () => {
    live = subscription('https://push.example/old', 'old-vapid-key')
    localStorage.setItem(ENDPOINT_KEY, 'https://push.example/old')
    const fresh = subscription('https://push.example/new', 'current-vapid-key')
    subscribe.mockResolvedValue(fresh)

    await syncPushSubscription()

    expect(live.unsubscribe).toHaveBeenCalled()
    expect(subscribe).toHaveBeenCalled()
    expect(subscribeToPush).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push.example/new' }))
    // The row under the retired endpoint is a corpse once the new one is registered.
    expect(unsubscribeFromPush).toHaveBeenCalledWith({ endpoint: 'https://push.example/old' })
    expect(pushEndpoint()).toBe('https://push.example/new')
  })

  it('keeps a subscription that already carries the current key', async () => {
    live = subscription('https://push.example/same', 'current-vapid-key')
    localStorage.setItem(ENDPOINT_KEY, 'https://push.example/same')

    await syncPushSubscription()

    expect(live.unsubscribe).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
    expect(unsubscribeFromPush).not.toHaveBeenCalled()
    expect(subscribeToPush).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push.example/same' }))
  })

  // An unreachable push service leaves `subscribe` pending instead of rejecting, so without a
  // deadline the caller waits forever and nothing throws for the error log to record.
  it('gives up on a subscribe that never answers', async () => {
    live = subscription('https://push.example/old', 'old-vapid-key')
    localStorage.setItem(ENDPOINT_KEY, 'https://push.example/old')
    subscribe.mockReturnValue(new Promise(() => {}))

    vi.useFakeTimers()

    try {
      let outcome: unknown = 'pending'
      const done = syncPushSubscription().then(
        () => (outcome = 'resolved'),
        (cause: unknown) => (outcome = cause),
      )

      await vi.advanceTimersByTimeAsync(14_000)
      expect(outcome).toBe('pending')

      await vi.advanceTimersByTimeAsync(2_000)
      await done

      expect(outcome).toBeInstanceOf(Error)
      expect((outcome as Error).message).toContain('did not answer in time')
      // The device is left unregistered rather than recorded against a subscription it never got.
      expect(subscribeToPush).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // Switched off, or never on: the permission is granted but this device opted out, and a sync
  // must not quietly opt it back in.
  it('leaves a device with no subscription and no remembered endpoint alone', async () => {
    await syncPushSubscription()

    expect(subscribe).not.toHaveBeenCalled()
    expect(subscribeToPush).not.toHaveBeenCalled()
    expect(pushEndpoint()).toBeUndefined()
  })
})
