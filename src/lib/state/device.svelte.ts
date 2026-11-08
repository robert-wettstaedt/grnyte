import { browser } from '$app/environment'

/**
 * What kind of device this is, as far as it matters to the app.
 *
 * Capability, never platform: nothing here sniffs a user agent or names a vendor, for the same
 * reason `install.svelte.ts` does not. A media query answers the only questions we have,
 * and it retires itself when the hardware landscape moves.
 *
 * Read once. A phone does not grow a mouse mid-session, and the standalone case is kept live below.
 */

let coarse = false
let installed = $state(false)

if (browser) {
  // Optional calls, same as the landing page's reduced-motion check: jsdom has no matchMedia.
  coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  // Also covers the iOS Home Screen case: the manifest is already `display: 'standalone'`.
  installed = window.matchMedia?.('(display-mode: standalone)').matches ?? false

  addEventListener('appinstalled', () => (installed = true))
}

/** A primary pointer that is a finger. Phones and tablets. */
export function hasCoarsePointer(): boolean {
  return coarse
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
 * for on every device, because the image cache is on every device.
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
