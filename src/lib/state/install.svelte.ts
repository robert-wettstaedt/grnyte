import { browser } from '$app/environment'
import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
import { hasCoarsePointer, isInstalled } from '$lib/state/device.svelte'
import { now } from '$lib/state/now.svelte'

/**
 * Whether to promote installing the PWA, and how.
 *
 * Capability, never platform: nothing here sniffs a user agent or names a vendor.
 *
 * - `beforeinstallprompt` exists on Chromium browsers only, and its absence is most of the answer
 *   for the ones that do not have it.
 * - The Push API check is the iOS gate without mentioning iOS. In a browser tab there the Push API
 *   is absent, and it appears once the app runs from the Home Screen. Testing the
 *   capability rather than the platform means the branch retires itself: if push from a tab ever
 *   works, the check starts returning true and the install gate disappears with no code change.
 * - `pointer: coarse` limits promotion to phones and tablets. A desktop install buys nothing here,
 *   and a wrong answer costs one banner rather than correctness, so a media query is enough.
 */
export type InstallMode =
  /** Not installable through an API here, and push needs the install: instruct instead. */
  | 'manual'
  /** Installable, but no live prompt to fire: point at the browser's own install entry. */
  | 'menu'
  /** Installed already, on a desktop, or nothing to offer. Promote nothing. */
  | 'none'
  /** A stashed `beforeinstallprompt` is ready to fire. */
  | 'prompt'

const DISMISSED_AT_KEY = `${PUBLIC_APPLICATION_NAME}.installBannerDismissedAt`
const DISMISS_COUNT_KEY = `${PUBLIC_APPLICATION_NAME}.installBannerDismissCount`

/** A dismissal is worth 30 days, and the third one retires the banner for good. */
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000
const MAX_DISMISSALS = 3

/**
 * How far ahead of `now` a dismissal may sit before it reads as a broken clock rather than as one
 * that was recently written. The shared clock ticks once a minute, so a dismissal made seconds ago is
 * routinely ahead of it; without this the card would reappear the instant somebody closed it.
 */
const CLOCK_TOLERANCE_MS = 5 * 60 * 1000

/**
 * The nag policy, kept pure so it can be asserted against. Unlike the notification permission, a
 * declined install is re-askable (the browser fires a fresh `beforeinstallprompt` on a later
 * visit), which is why a first dismissal snoozes rather than retires.
 */
export function isBannerDue(dismissedAt: null | number, dismissals: number, nowMs: number): boolean {
  if (dismissals >= MAX_DISMISSALS) {
    return false
  }

  // A timestamp well ahead of now is a wrong clock or a half-written value. Left alone it would
  // hide the card until the clock caught up, without ever counting toward retirement: treat as due.
  return dismissedAt == null || dismissedAt - nowMs > CLOCK_TOLERANCE_MS || nowMs - dismissedAt >= SNOOZE_MS
}

/**
 * The mode decision, kept pure for the same reason as the nag policy: every input below is a
 * browser fact read once at import, so this is the only way the matrix can be asserted against.
 *
 * `permanent` marks a surface somebody navigated to on purpose (settings, the invite screen) as
 * opposed to a banner that interrupts. Both promote the same install, but only the banner is
 * allowed to conclude there is nothing worth saying.
 */
export function resolveInstallMode(
  installed: boolean,
  touch: boolean,
  hasPrompt: boolean,
  pushSupported: boolean,
  permanent: boolean,
): InstallMode {
  if (installed || !touch) {
    return 'none'
  }

  if (hasPrompt) {
    return 'prompt'
  }

  // No prompt on offer and push needs the install: instructions are the whole conversion surface.
  if (!pushSupported) {
    return 'manual'
  }

  // Installable in principle, but `beforeinstallprompt` is one-shot: it may not have fired yet, or
  // it has been spent by a prompt the reader cancelled. A banner stays quiet rather than nag, but a
  // surface somebody opened looking for the install has to name the route the browser still offers.
  return permanent ? 'menu' : 'none'
}

// Every read and write below is guarded. A browser set to block storage throws on plain access,
// and the root layout imports this module for its side effect, so an unguarded throw would blank
// every route rather than cost one banner. Same defence as the theme bootstrap in app.html.
/** Drops the stashed event from both places that hold it, so a spent one cannot come back. */
function forgetPrompt(): void {
  deferred = undefined
  window.__installPrompt = null
}

function readStored(key: string): null | number {
  try {
    return Number(localStorage.getItem(key)) || null
  } catch {
    return null
  }
}

// Per browser, not per account: installability is a fact about this device, and storing it on the
// user would silence a phone because a laptop said no.
let dismissals = $state(0)
let dismissedAt = $state<null | number>(null)

let deferred = $state<BeforeInstallPromptEvent | undefined>(undefined)

// Push support is the one device fact that is only this module's business. The pointer and
// standalone facts moved to `$lib/state/device.svelte`, because the offline preload gate needs them
// too and a Zero client has no business importing install-promotion state to get them.
let pushSupported = false

if (browser) {
  pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  dismissals = readStored(DISMISS_COUNT_KEY) ?? 0
  dismissedAt = readStored(DISMISSED_AT_KEY)

  // The event fires as soon as Chrome has read the manifest, which on a server-rendered page beats
  // this module to it, and it is not replayed for a late listener. The inline script in app.html
  // is there to catch that case; this listener covers a prompt offered later in the session.
  deferred = window.__installPrompt ?? undefined
  addEventListener('beforeinstallprompt', (event) => {
    // preventDefault suppresses the browser's own mini-infobar, so our UI is the only ask.
    event.preventDefault()
    deferred = event
  })

  // Fires whether the install came from our button or from the browser's own affordance, so the
  // promotion retires itself either way. `device.svelte` listens for the same event to flip its own
  // standalone flag; two listeners are cheaper than one module reaching into the other.
  addEventListener('appinstalled', forgetPrompt)
}

export function dismissBanner(): void {
  const at = Date.now()
  // Re-read rather than reuse the in-memory count, so a dismissal made in another tab since load
  // is not clobbered by this write.
  const count = (readStored(DISMISS_COUNT_KEY) ?? 0) + 1

  try {
    // Timestamp first: if the second write throws, the snooze still holds. The reverse order would
    // burn a dismissal and then show the card again on the next load.
    localStorage.setItem(DISMISSED_AT_KEY, String(at))
    localStorage.setItem(DISMISS_COUNT_KEY, String(count))
  } catch {
    // Storage refused the write. The in-memory state below still hides the card for this page, and
    // the policy degrades to asking again next load, which is the safe direction.
  }

  dismissedAt = at
  dismissals = count
}

/**
 * Reactive. The one visibility rule, exported rather than reimplemented per surface so a caller
 * that has to decide *before* mounting the card (the invite screen, which routes on the answer)
 * cannot drift from what the card itself would do.
 */
export function installPromoMode(options: { dismissible?: boolean; permanent?: boolean } = {}): InstallMode {
  if (options.dismissible === true && !isBannerDue(dismissedAt, dismissals, now())) {
    return 'none'
  }

  return resolveInstallMode(
    isInstalled(),
    hasCoarsePointer(),
    deferred != null,
    pushSupported,
    options.permanent === true,
  )
}

/** Must be called from a click on our own UI: `prompt()` requires a user gesture. */
export async function promptInstall(): Promise<void> {
  const event = deferred
  if (event == null) {
    return
  }

  // Dropped before the call, not after: one `prompt()` per event instance, so a second tap on a
  // spent event would silently do nothing. The browser fires a fresh one on a later visit.
  forgetPrompt()

  try {
    await event.prompt()
  } catch {
    // Already consumed, or the browser judged the gesture expired. Nothing to report: the missing
    // dialog says the same thing, and a permanent surface has already fallen back to instructions.
  }
}
