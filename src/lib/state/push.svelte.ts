import { browser } from '$app/environment'
import { env as publicEnv } from '$env/dynamic/public'
import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
import { subscribeToPush, unsubscribeFromPush } from '$lib/entities/notification/notifications.remote'

/**
 * Whether this device can receive push, whether it does, and how to change that.
 *
 * Per device, never per account, because a subscription belongs to a browser. Storing any of this
 * on the user would tell a phone it had already been asked because a laptop had.
 *
 * The one rule everything here exists to protect: `Notification.requestPermission()` is called
 * ONLY from a click on our own UI, and the native prompt is one shot per origin. A decline is
 * permanent and unrecoverable in-app, so it is worth a soft ask first (see {@link promptDismissed}).
 * iOS Safari silently ignores a request outside a click handler, Firefox requires a gesture, and
 * Chrome downranks origins with poor accept rates into its quieter UI.
 */

/** What the UI has to render a state for. `unsupported` is a browser tab on iOS as much as it is
 *  an old desktop browser: the Push API is absent until the app is installed there. */
export type PushState = 'denied' | 'granted' | 'prompt' | 'unsupported'

const PROMPT_DISMISSED_KEY = `${PUBLIC_APPLICATION_NAME}.pushPromptDismissed`

/**
 * The endpoint this device last registered, and the one thing that tells a dropped subscription
 * from a switched-off one. Both look like "permission granted, no subscription", and the server
 * cannot separate them either: a disable deletes the row, and an account holds rows for other
 * devices. Cleared by {@link disablePush}. Read by {@link syncPushSubscription}.
 */
const ENDPOINT_KEY = `${PUBLIC_APPLICATION_NAME}.pushEndpoint`

/** Shared by every soft pre-prompt surface, so somebody sees the ask once in total rather than
 *  once per screen that offers it. */
let dismissed = $state(false)

let permission = $state<NotificationPermission | undefined>(undefined)
/** The endpoint this device is registered under, or `undefined` when it is not. */
let endpoint = $state<string | undefined>(undefined)
let supported = false

if (browser) {
  // The VAPID key counts as a capability: without one there is nothing to subscribe against, so
  // a deployment that has not configured push reads as a browser that cannot do it, which is the
  // same UI and the same truth.
  supported =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    (publicEnv.PUBLIC_VAPID_KEY ?? '').length > 0
  permission = supported ? Notification.permission : undefined

  try {
    dismissed = localStorage.getItem(PROMPT_DISMISSED_KEY) != null
  } catch {
    // Storage refused the read, so the ask is shown. Costs one card, never correctness.
  }
}

/**
 * Unsubscribe this device, at both ends. The permission stays granted, which is what makes this
 * re-enablable without another native prompt.
 *
 * Forgets {@link ENDPOINT_KEY} too, so the repair does not turn this back on.
 */
export async function disablePush(): Promise<void> {
  if (!browser || !supported) {
    return
  }

  rememberEndpoint(undefined)

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  const known = subscription?.endpoint ?? endpoint

  await subscription?.unsubscribe()

  if (known != null) {
    await unsubscribeFromPush({ endpoint: known })
  }

  endpoint = undefined
}

export function dismissPushPrompt(): void {
  try {
    localStorage.setItem(PROMPT_DISMISSED_KEY, String(Date.now()))
  } catch {
    // In-memory state still hides it for this page; it comes back next load, which is the safe
    // direction for something that is one tap to dismiss again.
  }
  dismissed = true
}

/**
 * Ask for permission and subscribe. MUST be called from a click on our own UI.
 *
 * Returns the state it ended in, so a caller can tell "granted" from "declined" without reading
 * `Notification.permission` a second time and racing the browser.
 */
export async function enablePush(): Promise<PushState> {
  if (!browser || !supported) {
    return 'unsupported'
  }

  permission = await Notification.requestPermission()

  if (permission !== 'granted') {
    return pushState()
  }

  const registration = await navigator.serviceWorker.ready
  const subscription = await subscribeCurrent(registration)

  endpoint = subscription.endpoint
  await register(subscription)

  return 'granted'
}

/** Reactive. Whether the soft ask has already been dismissed on this device. */
export function promptDismissed(): boolean {
  return dismissed
}

/** Reactive. Whether this device currently has a registered subscription. */
export function pushEndpoint(): string | undefined {
  return endpoint
}

/** Reactive. The state every push surface branches on. */
export function pushState(): PushState {
  if (!supported) {
    return 'unsupported'
  }

  return permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'prompt'
}

/**
 * Put this device's subscription and the server's row back in step, in both directions: a live
 * subscription whose row went missing (a reinstall, a cleared database, a failed request), and a
 * row whose subscription the browser dropped. `subscribeToPush` keys on the endpoint, so
 * re-registering is a no-op whenever the row is already right.
 *
 * ponytail: neither direction catches a subscription whose endpoint is unchanged and which the
 * push service has silently stopped delivering: nothing observable changes, so there is nothing
 * to compare. Upgrade = a server-side liveness heuristic.
 */
export async function syncPushSubscription(): Promise<void> {
  if (!browser || !supported || Notification.permission !== 'granted') {
    return
  }

  const registration = await navigator.serviceWorker.ready
  const live = await registration.pushManager.getSubscription()
  const known = storedEndpoint()

  // Granted, registered once, and gone. Invisible from both ends: the row survives and its sends
  // report success while the device stops being delivered to. Silent because the permission is
  // already granted, so `subscribe()` returns without a prompt. Gated on `known`, so a browser
  // that never subscribed here, or was switched off, is left alone.
  const subscription = live ?? (known == null ? undefined : await subscribeCurrent(registration))

  if (subscription == null) {
    endpoint = undefined
    return
  }

  endpoint = subscription.endpoint
  await register(subscription)

  // The endpoint moved, so the row under the old one is a corpse. Compared against the endpoint
  // we ENDED with, not the live one: the repair above is a rotation too, only one where the
  // browser lost the old handle instead of swapping it. After `register`, so a failure here costs
  // a stale row until the first 403/404/410 prunes it, rather than costing the repair.
  if (known != null && known !== subscription.endpoint) {
    await unsubscribeFromPush({ endpoint: known })
  }
}

/** Hand the browser's subscription to the server in the shape a send needs. */
async function register(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON()

  if (json.endpoint == null || json.keys?.auth == null || json.keys.p256dh == null) {
    // A subscription without its keys cannot be encrypted to, so storing it would only produce
    // failures later, attributed to the wrong thing.
    throw new Error('Push subscription is missing its keys')
  }

  await subscribeToPush({
    auth: json.keys.auth,
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    p256dh: json.keys.p256dh,
  })

  // After the server took it, never before: a remembered endpoint with no row behind it would arm
  // the repair against something that was never written.
  rememberEndpoint(json.endpoint)
}

/** Write (or clear) {@link ENDPOINT_KEY}. Storage refusing only means the repair does not arm. */
function rememberEndpoint(value: string | undefined): void {
  try {
    if (value == null) {
      localStorage.removeItem(ENDPOINT_KEY)
    } else {
      localStorage.setItem(ENDPOINT_KEY, value)
    }
  } catch {
    // See above.
  }
}

/** Whether a subscription was created with this exact key. */
function sameKey(stored: ArrayBuffer | null, current: BufferSource): boolean {
  if (stored == null) {
    return false
  }

  const a = new Uint8Array(stored)
  const b = current instanceof ArrayBuffer ? new Uint8Array(current) : new Uint8Array(current.buffer)
  return a.length === b.length && a.every((byte, index) => byte === b[index])
}

/** The endpoint this device last registered, if storage still has it. */
function storedEndpoint(): string | undefined {
  try {
    return localStorage.getItem(ENDPOINT_KEY) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * The device's subscription against the CURRENT VAPID key.
 *
 * An existing subscription is bound to the key it was created with, so after a rotation it still
 * exists, still looks healthy from here, and every send against it is rejected. Nothing else would
 * ever notice: the rejection is a 403, which is not in the delete-or-follow lifecycle, so the row
 * survives and push is silently dead on every device until somebody toggles it by hand.
 */
async function subscribeCurrent(registration: ServiceWorkerRegistration): Promise<PushSubscription> {
  const applicationServerKey = urlBase64ToUint8Array(publicEnv.PUBLIC_VAPID_KEY ?? '')
  const existing = await registration.pushManager.getSubscription()

  if (existing != null) {
    if (sameKey(existing.options.applicationServerKey, applicationServerKey)) {
      return existing
    }
    await existing.unsubscribe()
  }

  // `userVisibleOnly` is required by Chrome, and honest: every push this app sends shows something.
  return registration.pushManager.subscribe({ applicationServerKey, userVisibleOnly: true })
}

/**
 * The VAPID key as the Push API wants it: raw bytes, not the URL-safe base64 it is published as.
 * ponytail: hand-rolled because `atob` is the only decoder browsers ship and it does not speak
 * the URL-safe alphabet.
 */
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  // Sized first, then filled: `Uint8Array.from` infers `ArrayBufferLike`, which the Push API's
  // `BufferSource` does not accept (it wants a plain `ArrayBuffer` behind the view).
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index)
  }
  return bytes
}
