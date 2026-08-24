import { browser } from '$app/environment'
import { PUBLIC_APPLICATION_NAME } from '$env/static/public'

/**
 * What kind of device this is, as far as it matters to the app.
 *
 * Capability, never platform: nothing here sniffs a user agent or names a vendor, for the same
 * reason `install.svelte.ts` does not. A media query answers the only questions we actually have,
 * and it retires itself when the hardware landscape moves.
 *
 * Read once. A phone does not grow a mouse mid-session, and the standalone case is kept live below.
 */

let coarse = false
let fine = false
let hover = false
let installed = $state(false)

if (browser) {
  // Optional calls, same as the landing page's reduced-motion check: jsdom has no matchMedia.
  coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  fine = window.matchMedia?.('(pointer: fine)').matches ?? false
  hover = window.matchMedia?.('(hover: hover)').matches ?? false
  // Also covers the iOS Home Screen case: the manifest is already `display: 'standalone'`.
  installed = window.matchMedia?.('(display-mode: standalone)').matches ?? false

  addEventListener('appinstalled', () => (installed = true))
}

/** A primary pointer that is a finger. Phones and tablets. */
export function hasCoarsePointer(): boolean {
  return coarse
}

/**
 * Whether to keep this device's data available offline.
 *
 * Deliberately the inverse of the test you would expect: it does not ask "is this a phone", it asks
 * "is this confidently *not* a phone", and everything ambiguous answers yes. The costs are not
 * symmetric. A phone misread as a desktop loses offline access entirely, and finds out in a forest
 * with no signal and no way to fix it; a desktop misread as a phone costs a few megabytes of CVR on
 * the server. So a touchscreen laptop, a tablet, a browser with no `matchMedia`, and anything else
 * we cannot classify all fall on the preload side.
 *
 * `display-mode: standalone` counts as a field device on its own: somebody who installed the app
 * asked for it to behave like one.
 *
 * The override below settles the answer either way, and exists because the automatic one is not
 * falsifiable from the inside: a plain desktop browser is *by design* excluded from the preload, so
 * "offline does not work here" looks identical whether the gate is behaving or a bug is. It is also
 * the escape hatch for a device we classify wrongly and for somebody who wants the guidebook on a
 * laptop. `localStorage` rather than `userSettings`, for the same reason the sync stamp is: this is
 * a fact about one browser, not about an account.
 *
 * The key is prefixed with `PUBLIC_APPLICATION_NAME`, which differs per environment and is
 * `grnyte LOCAL` (with the space) on a local stack, so read it from the app rather than typing it:
 *
 * ```js
 * localStorage.setItem(`${PUBLIC_APPLICATION_NAME}.offlineData`, 'always') // or 'never' to opt out
 * ```
 */
export function isFieldDevice(): boolean {
  const override = readOverride()

  if (override != null) {
    return override
  }

  if (installed) {
    return true
  }

  // A mouse *and* real hover *and* not installed is the only combination we treat as a desktop.
  return !(fine && hover)
}

/** Running from the Home Screen or as an installed app rather than in a browser tab. Reactive. */
export function isInstalled(): boolean {
  return installed
}

/**
 * Asks the browser to stop treating this origin's storage as disposable.
 *
 * Without it everything we keep is best-effort: the browser evicts under storage pressure, and it
 * evicts an origin whole, so the Zero replica and the cached topo images go together. Worth asking
 * for on every device, not just the ones that preload, because the image cache is on every device.
 *
 * Firefox shows the user a permission prompt; Chromium and WebKit decide silently from how much the
 * person has used the site, which means the occasional visitor who most needs this is the one most
 * likely to be refused. Nothing here can change that, so a refusal is not an error and is not
 * surfaced: it degrades to exactly the behaviour we have today.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!browser || navigator.storage?.persist == null) {
    return false
  }

  try {
    // Already granted from an earlier visit: asking again would re-prompt on Firefox for nothing.
    if (await navigator.storage.persisted()) {
      return true
    }

    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** The stored answer to "keep data on this device", or null when it is left to {@link isFieldDevice}. */
function readOverride(): boolean | null {
  if (!browser) {
    return null
  }

  try {
    const raw = localStorage.getItem(`${PUBLIC_APPLICATION_NAME}.offlineData`)
    return raw === 'always' ? true : raw === 'never' ? false : null
  } catch {
    // Storage refused the read (private mode, disabled cookies). Fall back to detection.
    return null
  }
}
