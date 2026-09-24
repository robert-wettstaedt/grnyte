import { afterNavigate, goto, replaceState } from '$app/navigation'
import { page } from '$app/state'
import { onNavigation } from './scroll'
import { createTrail } from './trail.svelte'

// One trail for the app, over the browser. `createTrail` holds the rules; this supplies the two
// moves it can ask for, so a test can supply a recording fake instead.
const trail = createTrail({
  back: () => history.back(),
  replace: (href, options) => replaceUrl(href, options),
})

// afterNavigate reports a replaceState goto as a plain 'goto' (SvelteKit exposes
// no replace signal), which would otherwise record a pushed entry that never existed
// (e.g. the media viewer paging siblings via replace). Navigations issued
// through replaceUrl() raise this flag; the tracker consumes it instead of counting.
let replacing = false

// Where a redirect is headed, so `afterNavigate` can tell it from a screen change.
//
// The DESTINATION, not a boolean: a resolver forwards from an `$effect` during its own mount, so a
// boolean is consumed by that mount's navigation instead of by the redirect.
//
// Discarded after one further navigation, so a redirect that never arrives cannot go stale. One,
// because the resolver's own mount is the navigation it has to survive. Do NOT clear it when the
// `goto` settles: measured, that settles BEFORE the redirect's `afterNavigate`.
let forwardingMisses = 0
let forwardingTo: string | undefined

// The route a feedback report is about: the form is reached through settings, so settings
// pathnames are skipped.
let lastAppPath = $state('')

/**
 * Go back within the app, or navigate to `up` when nothing of the app is behind us: a shared link,
 * a notification, or a cold start. `up` is that screen's parent, never a general fallback.
 */
export function back(up: string) {
  trail.back(up)
}

/** True when there is a same-origin entry we can safely go back to. */
export function canGoBack(): boolean {
  return trail.canGoBack()
}

/** Close the viewer: pop the `?media` entry, or replace it away on a deep link. */
export function closeMedia() {
  const url = mediaUrl(null)
  back(url.pathname + url.search)
}

/**
 * Leave a finished task for `destination`, retiring the screen it was performed on so back can
 * never return to it. Pops when `destination` is what a back press would already reach, otherwise
 * replaces the finished screen in place.
 */
export function exit(destination: string): Promise<void> {
  return trail.exit(destination)
}

/** Last non-settings route, `''` when there has not been one. */
export function lastAppRoute(): string {
  return lastAppPath
}

/** Open the viewer for `id`: pushes `?media` so the back button closes it. */
export function openMedia(id: string) {
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- same-page query change, not a route.
  return goto(mediaUrl(id), { keepFocus: true, noScroll: true })
}

/** Page to sibling `id`: replaces `?media` so paging stays one history entry. */
export function pageMedia(id: string) {
  return replaceUrl(mediaUrl(id), { keepFocus: true, noScroll: true })
}

/**
 * Plain forward navigation onto a new entry. The only sanctioned `goto` wrapper, so the lint rule
 * can ban every other import of it and the push/replace/exit choice stays explicit at the call site.
 */
export function push(href: string | URL, opts: Omit<object & Parameters<typeof goto>[1], 'replaceState'> = {}) {
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolved app paths
  return goto(href, opts)
}

/**
 * Forward to the canonical URL for what the reader asked for, replacing this entry so back does not
 * bounce through the resolver. The destination is exempt from the scroll reset.
 *
 * Only for a destination that POSITIONS ITSELF, such as the ascent deep link scrolling to its row.
 * A screen with no position of its own would keep the previous screen's offset.
 */
export function redirectTo(url: string | URL, opts: Omit<object & Parameters<typeof goto>[1], 'replaceState'> = {}) {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read once here, nothing observes it
  forwardingTo = new URL(url, location.href).pathname
  forwardingMisses = 0
  return replaceUrl(url, opts)
}

/**
 * `goto` with `replaceState: true` that the trail records as a replace rather than a push. Use
 * this (not a raw goto) for every replace navigation, or the back-button logic drifts.
 */
export function replaceUrl(url: string | URL, opts: Omit<object & Parameters<typeof goto>[1], 'replaceState'> = {}) {
  replacing = true
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolved/same-page URLs
  return goto(url, { ...opts, replaceState: true }).finally(() => {
    // Also cleared here, not only by the tracker: a navigation that threw, or that a
    // `beforeNavigate` cancelled, never reaches `afterNavigate`, and a latched flag would record
    // the next real push as a replace.
    replacing = false
  })
}

/**
 * Mirror a page's own state into the query string, leaving every param it does not own alone.
 *
 * `replaceState` rather than a `goto`: the values are already in memory, so there is nothing to
 * load, and the back button keeps meaning "the page before this one" rather than "the filter
 * before this one". Call it from an `$effect` over the state being mirrored.
 */
export function syncSearchParams(values: Record<string, number | string | undefined>) {
  const url = withSearchParams(page.url, values)

  // Guarded, because the effect re-runs on the `page.url` its own write produces.
  if (url.search !== page.url.search) {
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- the path is `page.url`'s own, already resolved; only the query changes
    replaceState(url, page.state)
  }
}

/** Register once from a top-level layout to track same-origin navigation. */
export function trackHistoryDepth() {
  afterNavigate((navigation) => {
    const to = navigation.to?.url
    if (to != null && !to.pathname.startsWith('/settings')) {
      lastAppPath = to.pathname
    }

    // link / goto / form pushes a new entry, unless it was a replaceUrl()
    // navigation, which swapped the current one in place.
    const pushed = !replacing
    replacing = false

    // Classified once and read twice, so the trail and the scroll rule cannot disagree.
    const type =
      navigation.type === 'enter' || navigation.type === 'popstate' ? navigation.type : pushed ? 'push' : 'replace'

    trail.record({
      delta: navigation.type === 'popstate' ? navigation.delta : undefined,
      href: to == null ? '' : to.pathname + to.search,
      type,
    })

    // `from.url` is null on a document's first navigation. An unknown origin counts as a different
    // screen, because two nullish pathnames would compare equal and suppress the reset.
    const fromPathname = navigation.from?.url?.pathname
    const forwarded = forwardingTo != null && forwardingTo === to?.pathname
    if (forwarded || (forwardingTo != null && (forwardingMisses += 1) > 1)) {
      forwardingTo = undefined
    }

    onNavigation(type, forwarded || (fromPathname != null && fromPathname === to?.pathname))
  })
}

/**
 * A copy of `url` with `values` written onto its query: set when a value is there, deleted when
 * it is `undefined` or empty. Every other param keeps its key, its value and its position.
 *
 * Not byte-for-byte, though: a write re-serialises the whole query through `URLSearchParams`, so
 * params this call never named are normalised along with it (`%20` becomes `+`, a valueless
 * `?debug` becomes `?debug=`). Do not mirror state next to a param whose exact bytes are the
 * point, a signature or a base64 token; read those before the first write, or keep them in the
 * path.
 *
 * Split out from {@link syncSearchParams} because this half is the one with the sharp edge, and
 * it is testable without a browser. Normalising through a `URL` is also what makes the round trip
 * a fixed point: hand-building the string with `encodeURIComponent` and comparing it against what
 * the browser reports back compares two different serialisers (a space is `%20` on one side and
 * `+` on the other), so the guard in `syncSearchParams` never matches and it replaces forever.
 */
export function withSearchParams(url: URL, values: Record<string, number | string | undefined>): URL {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a throwaway value, built and read within the call; nothing reads it reactively
  const next = new URL(url)

  for (const [key, value] of Object.entries(values)) {
    if (value == null || value === '') {
      next.searchParams.delete(key)
    } else {
      next.searchParams.set(key, String(value))
    }
  }

  return next
}

// The `?media=<file id>` param drives the fullscreen media viewer for a set of
// files: opening pushes a history entry (back closes it), paging replaces it in
// place, closing pops it. One place owns the URL mechanics so the open/page/close
// history semantics can't drift between the thumbnail, the overflow chip, and the
// viewer's own paging.
function mediaUrl(id: null | string): URL {
  return withSearchParams(page.url, { media: id ?? undefined })
}
